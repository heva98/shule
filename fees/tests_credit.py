import datetime
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_academic_year, make_student, make_user

from .models import (
    FeeCategory,
    Invoice,
    InvoiceKind,
    InvoiceLine,
    LineStatus,
    Payment,
    StudentCredit,
)
from .services import allocate_payment, void_line


class CreditFlowTests(TestCase):
    def setUp(self):
        self.year = make_academic_year()
        self.bursar = make_user(role=Role.BURSAR)
        self.student = make_student(level='STD3')
        self.client = APIClient()
        self.client.force_authenticate(user=self.bursar)

        self.invoice = Invoice.objects.create(
            student=self.student, academic_year=self.year, kind=InvoiceKind.QUARTERLY,
            term='TERM1', quarter='Q1', due_date=datetime.date(2026, 3, 1),
        )
        self.transport = InvoiceLine.objects.create(
            invoice=self.invoice, category=FeeCategory.TRANSPORT, amount=Decimal('80000'),
        )
        self.tuition = InvoiceLine.objects.create(
            invoice=self.invoice, category=FeeCategory.TUITION, amount=Decimal('300000'),
        )

        # pay 40k against transport, then void transport -> 40k carried credit
        pay = Payment.objects.create(
            student=self.student, amount=Decimal('40000'), payment_method='CASH',
            paid_at=datetime.datetime.now(), received_by=self.bursar,
        )
        allocate_payment(pay, [(self.transport, Decimal('40000'))])
        void_line(self.transport, self.bursar, 'route cancelled')
        self.credit = StudentCredit.objects.get(student=self.student)

    def test_void_produced_credit(self):
        self.assertEqual(self.credit.amount, Decimal('40000'))
        self.assertEqual(self.credit.remaining_amount, Decimal('40000'))

    def test_credits_endpoint_lists_available(self):
        resp = self.client.get('/api/fees/credits/', {'student': self.student.id, 'available': '1'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['results']), 1)
        self.assertEqual(resp.data['results'][0]['remaining_amount'], '40000.00')

    def test_apply_credit_to_another_charge(self):
        resp = self.client.post('/api/fees/payments/', {
            'student': self.student.id,
            'amount': '40000',
            'payment_method': 'CARRIED_CREDIT',
            'funded_from_credit': self.credit.id,
            'paid_at': datetime.datetime.now().isoformat(),
            'allocations_input': [{'invoice_line': self.tuition.id, 'amount': '40000'}],
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)

        self.credit.refresh_from_db()
        self.tuition.refresh_from_db()
        self.assertEqual(self.credit.remaining_amount, Decimal('0'))
        self.assertEqual(self.tuition.amount_allocated, Decimal('40000'))
        self.assertEqual(self.tuition.status, LineStatus.PARTIAL)

        receipt = self.client.get(f"/api/fees/payments/{resp.data['id']}/receipt/").data
        self.assertTrue(receipt['from_credit'])

    def test_credit_payment_requires_credit_ref(self):
        resp = self.client.post('/api/fees/payments/', {
            'student': self.student.id, 'amount': '10000',
            'payment_method': 'CARRIED_CREDIT',
            'paid_at': datetime.datetime.now().isoformat(),
            'allocations_input': [{'invoice_line': self.tuition.id, 'amount': '10000'}],
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_credit_payment_cannot_exceed_remaining(self):
        resp = self.client.post('/api/fees/payments/', {
            'student': self.student.id, 'amount': '50000',
            'payment_method': 'CARRIED_CREDIT', 'funded_from_credit': self.credit.id,
            'paid_at': datetime.datetime.now().isoformat(),
            'allocations_input': [{'invoice_line': self.tuition.id, 'amount': '50000'}],
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_credit_of_other_student_rejected(self):
        other = make_student()
        other_inv = Invoice.objects.create(
            student=other, academic_year=self.year, kind=InvoiceKind.QUARTERLY,
            term='TERM1', quarter='Q1', due_date=datetime.date(2026, 3, 1),
        )
        other_line = InvoiceLine.objects.create(
            invoice=other_inv, category=FeeCategory.TUITION, amount=Decimal('100000'),
        )
        resp = self.client.post('/api/fees/payments/', {
            'student': other.id, 'amount': '40000',
            'payment_method': 'CARRIED_CREDIT', 'funded_from_credit': self.credit.id,
            'paid_at': datetime.datetime.now().isoformat(),
            'allocations_input': [{'invoice_line': other_line.id, 'amount': '40000'}],
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_non_credit_payment_with_credit_ref_rejected(self):
        resp = self.client.post('/api/fees/payments/', {
            'student': self.student.id, 'amount': '10000', 'payment_method': 'CASH',
            'funded_from_credit': self.credit.id,
            'paid_at': datetime.datetime.now().isoformat(),
            'allocations_input': [{'invoice_line': self.tuition.id, 'amount': '10000'}],
        }, format='json')
        self.assertEqual(resp.status_code, 400)


class OutstandingLinesFilterTests(TestCase):
    def setUp(self):
        self.year = make_academic_year()
        self.bursar = make_user(role=Role.BURSAR)
        self.student = make_student(level='STD3')
        self.client = APIClient()
        self.client.force_authenticate(user=self.bursar)

        inv = Invoice.objects.create(
            student=self.student, academic_year=self.year, kind=InvoiceKind.ANNUAL,
            due_date=datetime.date(2026, 3, 1),
        )
        self.a = InvoiceLine.objects.create(invoice=inv, category=FeeCategory.TUITION, amount=Decimal('100'))
        self.b = InvoiceLine.objects.create(invoice=inv, category=FeeCategory.OTHER, amount=Decimal('50'))
        pay = Payment.objects.create(
            student=self.student, amount=Decimal('50'), payment_method='CASH',
            paid_at=datetime.datetime.now(), received_by=self.bursar,
        )
        allocate_payment(pay, [(self.b, Decimal('50'))])  # b now PAID

    def test_outstanding_filter_excludes_paid_lines(self):
        resp = self.client.get('/api/fees/invoice-lines/', {
            'student': self.student.id, 'outstanding': '1',
        })
        ids = [r['id'] for r in resp.data['results']]
        self.assertIn(self.a.id, ids)
        self.assertNotIn(self.b.id, ids)
