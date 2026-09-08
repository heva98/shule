import datetime
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_academic_year, make_student, make_user

from .models import FeeCategory, InvoiceKind, InvoiceLine, LineStatus, UniformSaleItem
from .sales import create_uniform_sale
from .summaries import student_fee_summary


class UniformSaleServiceTests(TestCase):
    def setUp(self):
        self.year = make_academic_year()
        self.bursar = make_user(role=Role.BURSAR)
        self.student = make_student(level='STD3')

    def test_sale_line_totals_items(self):
        line = create_uniform_sale(
            self.student,
            [{'name': 'Shirt', 'qty': 2, 'unit_price': '20000'},
             {'name': 'Trouser', 'qty': 1, 'unit_price': '30000'}],
            academic_year=self.year, created_by=self.bursar,
        )
        self.assertEqual(line.amount, Decimal('70000'))
        self.assertEqual(line.category, FeeCategory.UNIFORM)
        self.assertTrue(line.is_sale)
        self.assertEqual(line.invoice.kind, InvoiceKind.SALE)
        self.assertEqual(line.sale_items.count(), 2)
        self.assertEqual(line.invoice.amount_due, Decimal('70000'))

    def test_sale_excluded_from_fee_summary(self):
        create_uniform_sale(
            self.student, [{'name': 'Tie', 'qty': 1, 'unit_price': '5000'}],
            academic_year=self.year, created_by=self.bursar,
        )
        summary = student_fee_summary(self.student, self.year)
        self.assertEqual(summary['categories'], [])
        self.assertEqual(summary['totals']['required'], '0')

    def test_zero_total_rejected(self):
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            create_uniform_sale(
                self.student, [{'name': 'Free', 'qty': 1, 'unit_price': '0'}],
                academic_year=self.year, created_by=self.bursar,
            )


class UniformSaleApiTests(TestCase):
    def setUp(self):
        self.year = make_academic_year()
        self.bursar = make_user(role=Role.BURSAR)
        self.student = make_student(level='STD3')
        self.client = APIClient()
        self.client.force_authenticate(user=self.bursar)

    def test_teacher_forbidden(self):
        c = APIClient()
        c.force_authenticate(user=make_user(role=Role.TEACHER))
        resp = c.post('/api/fees/uniform-sales/', {
            'student': self.student.id,
            'items': [{'name': 'Shirt', 'qty': 1, 'unit_price': '20000'}],
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_sale_without_payment(self):
        resp = self.client.post('/api/fees/uniform-sales/', {
            'student': self.student.id,
            'academic_year': self.year.id,
            'items': [{'name': 'Shirt', 'qty': 2, 'unit_price': '20000'}],
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertNotIn('receipt', resp.data)
        line = resp.data['invoice_line']
        self.assertEqual(line['amount'], '40000.00')
        self.assertEqual(len(line['sale_items']), 1)

        # not part of the normal outstanding list
        out = self.client.get('/api/fees/invoice-lines/', {
            'student': self.student.id, 'outstanding': '1',
        }).data['results']
        self.assertEqual(out, [])
        # but visible when sales are explicitly included
        out2 = self.client.get('/api/fees/invoice-lines/', {
            'student': self.student.id, 'outstanding': '1', 'include_sales': '1',
        }).data['results']
        self.assertEqual(len(out2), 1)

    def test_sale_with_payment_returns_itemised_receipt(self):
        resp = self.client.post('/api/fees/uniform-sales/', {
            'student': self.student.id,
            'academic_year': self.year.id,
            'items': [
                {'name': 'Shirt', 'qty': 2, 'unit_price': '20000'},
                {'name': 'Trouser', 'qty': 1, 'unit_price': '30000'},
            ],
            'payment': {'payment_method': 'CASH'},
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        receipt = resp.data['receipt']
        self.assertEqual(receipt['amount'], '70000.00')
        self.assertTrue(receipt['is_sale'])
        names = sorted(i['name'] for i in receipt['sale_items'])
        self.assertEqual(names, ['Shirt', 'Trouser'])
        self.assertEqual(
            InvoiceLine.objects.get(pk=resp.data['invoice_line']['id']).status,
            LineStatus.PAID,
        )
