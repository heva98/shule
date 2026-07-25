import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_academic_year, make_student, make_user
from students.models import Guardian

from .models import FeeStructure, Invoice, InvoiceStatus


class InvoiceParentScopingTests(TestCase):
    """A parent must only ever see invoices for their own children — not any
    student ID they happen to pass in ?student=, and not via ?student= at all
    for someone else's child."""

    def setUp(self):
        self.academic_year = make_academic_year()
        self.own_child = make_student()
        Guardian.objects.create(
            student=self.own_child, full_name='Parent', relationship='FATHER',
            phone='+255712340001', email='parent@test.local',
        )
        self.other_child = make_student()
        self.parent = make_user(role=Role.PARENT, phone='+255712340001', email='parent@test.local')

        self.own_invoice = Invoice.objects.create(
            student=self.own_child, academic_year=self.academic_year, term='TERM1', quarter='Q1',
            amount_due=100000, due_date=datetime.date.today() + datetime.timedelta(days=30),
        )
        self.other_invoice = Invoice.objects.create(
            student=self.other_child, academic_year=self.academic_year, term='TERM1', quarter='Q1',
            amount_due=100000, due_date=datetime.date.today() + datetime.timedelta(days=30),
        )

    def test_parent_sees_only_own_childs_invoice_in_list(self):
        client = APIClient()
        client.force_authenticate(user=self.parent)
        resp = client.get('/api/fees/invoices/')
        self.assertEqual(resp.status_code, 200)
        ids = [inv['id'] for inv in resp.data['results']]
        self.assertIn(self.own_invoice.id, ids)
        self.assertNotIn(self.other_invoice.id, ids)

    def test_parent_cannot_see_other_childs_invoice_by_passing_student_param(self):
        client = APIClient()
        client.force_authenticate(user=self.parent)
        resp = client.get(f'/api/fees/invoices/?student={self.other_child.id}')
        self.assertEqual(resp.status_code, 200)
        ids = [inv['id'] for inv in resp.data['results']]
        self.assertNotIn(self.other_invoice.id, ids)
        self.assertEqual(ids, [])

    def test_parent_cannot_retrieve_other_childs_invoice_directly(self):
        client = APIClient()
        client.force_authenticate(user=self.parent)
        resp = client.get(f'/api/fees/invoices/{self.other_invoice.id}/')
        self.assertEqual(resp.status_code, 404)

    def test_parent_cannot_generate_invoices(self):
        client = APIClient()
        client.force_authenticate(user=self.parent)
        resp = client.post('/api/fees/invoices/generate/', {
            'academic_year': self.academic_year.id, 'term': 'TERM1', 'quarter': 'Q1',
            'level': 'STD1', 'due_date': str(datetime.date.today()),
        }, format='json')
        self.assertEqual(resp.status_code, 403)


class FeesPermissionTests(TestCase):
    def setUp(self):
        self.academic_year = make_academic_year()

    def test_teacher_cannot_access_invoices(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.get('/api/fees/invoices/')
        self.assertEqual(resp.status_code, 403)

    def test_bursar_can_access_invoices(self):
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.get('/api/fees/invoices/')
        self.assertEqual(resp.status_code, 200)

    def test_teacher_cannot_access_fee_structures(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.get('/api/fees/structures/')
        self.assertEqual(resp.status_code, 403)

    def test_bursar_can_create_fee_structure(self):
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.post('/api/fees/structures/', {
            'academic_year': self.academic_year.id, 'level': 'STD1',
            'term': 'TERM1', 'quarter': 'Q1', 'tuition_fee': '50000',
        }, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_teacher_cannot_access_payments(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.get('/api/fees/payments/')
        self.assertEqual(resp.status_code, 403)

    def test_bursar_can_record_payment(self):
        bursar = make_user(role=Role.BURSAR)
        student = make_student()
        invoice = Invoice.objects.create(
            student=student, academic_year=self.academic_year, term='TERM1', quarter='Q1',
            amount_due=100000, due_date=datetime.date.today() + datetime.timedelta(days=30),
        )
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.post('/api/fees/payments/', {
            'invoice': invoice.id, 'amount': '50000', 'payment_method': 'CASH',
            'paid_at': datetime.datetime.now().isoformat(),
        }, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_teacher_cannot_view_defaulters(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.get('/api/fees/defaulters/')
        self.assertEqual(resp.status_code, 403)

    def test_any_authenticated_role_can_list_academic_years(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.get('/api/fees/academic-years/')
        self.assertEqual(resp.status_code, 200)

    def test_teacher_cannot_create_academic_year(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.post('/api/fees/academic-years/', {'year': 2099}, format='json')
        self.assertEqual(resp.status_code, 403)
