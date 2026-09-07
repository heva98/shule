import datetime
from decimal import Decimal

from django.test import TestCase
from rest_framework.exceptions import ValidationError
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
    PaymentStatus,
    StudentCredit,
)
from .services import allocate_payment, auto_allocate, reverse_payment, void_line


def _due(days=30):
    return datetime.date.today() + datetime.timedelta(days=days)


class LedgerTestCase(TestCase):
    def setUp(self):
        self.year = make_academic_year()
        self.student = make_student(level='STD3')
        self.bursar = make_user(role=Role.BURSAR)

        self.invoice = Invoice.objects.create(
            student=self.student, academic_year=self.year,
            kind=InvoiceKind.QUARTERLY, term='TERM1', quarter='Q1',
            due_date=_due(),
        )
        self.tuition = InvoiceLine.objects.create(
            invoice=self.invoice, category=FeeCategory.TUITION, amount=Decimal('300000'),
        )
        self.transport = InvoiceLine.objects.create(
            invoice=self.invoice, category=FeeCategory.TRANSPORT, amount=Decimal('100000'),
        )
        self.activity = InvoiceLine.objects.create(
            invoice=self.invoice, category=FeeCategory.ACTIVITY, amount=Decimal('20000'),
        )

    def _payment(self, amount, method='CASH'):
        return Payment.objects.create(
            student=self.student, invoice=self.invoice, amount=Decimal(amount),
            payment_method=method, paid_at=datetime.datetime.now(),
            received_by=self.bursar,
        )


class RecomputeTests(LedgerTestCase):
    def test_invoice_totals_derive_from_lines(self):
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_due, Decimal('420000'))
        self.assertEqual(self.invoice.amount_paid, Decimal('0'))

    def test_explicit_allocation_splits_across_categories(self):
        pay = self._payment('4700')
        allocate_payment(pay, [
            (self.tuition, Decimal('3000')),
            (self.transport, Decimal('1000')),
            (self.activity, Decimal('700')),
        ])
        self.tuition.refresh_from_db()
        self.transport.refresh_from_db()
        self.invoice.refresh_from_db()
        self.assertEqual(self.tuition.amount_allocated, Decimal('3000'))
        self.assertEqual(self.tuition.status, LineStatus.PARTIAL)
        self.assertEqual(self.invoice.amount_paid, Decimal('4700'))

    def test_line_paid_in_full_flips_status(self):
        pay = self._payment('20000')
        allocate_payment(pay, [(self.activity, Decimal('20000'))])
        self.activity.refresh_from_db()
        self.assertEqual(self.activity.status, LineStatus.PAID)
        self.assertEqual(self.activity.outstanding, Decimal('0'))


class InvariantTests(LedgerTestCase):
    def test_cannot_overpay_a_line(self):
        pay = self._payment('25000')
        with self.assertRaises(ValidationError):
            allocate_payment(pay, [(self.activity, Decimal('25000'))])

    def test_allocations_must_sum_to_payment_amount(self):
        pay = self._payment('5000')
        with self.assertRaises(ValidationError):
            allocate_payment(pay, [(self.tuition, Decimal('4000'))])

    def test_cannot_allocate_to_other_students_line(self):
        other = make_student()
        other_inv = Invoice.objects.create(
            student=other, academic_year=self.year, kind=InvoiceKind.QUARTERLY,
            term='TERM1', quarter='Q1', due_date=_due(),
        )
        other_line = InvoiceLine.objects.create(
            invoice=other_inv, category=FeeCategory.TUITION, amount=Decimal('10000'),
        )
        pay = self._payment('5000')
        with self.assertRaises(ValidationError):
            allocate_payment(pay, [(other_line, Decimal('5000'))])


class AutoAllocateTests(LedgerTestCase):
    def test_auto_allocate_fills_tuition_first(self):
        pay = self._payment('350000')
        auto_allocate(pay, self.invoice)
        self.tuition.refresh_from_db()
        self.transport.refresh_from_db()
        self.assertEqual(self.tuition.amount_allocated, Decimal('300000'))
        self.assertEqual(self.transport.amount_allocated, Decimal('50000'))

    def test_auto_allocate_rejects_over_invoice_balance(self):
        pay = self._payment('999999')
        with self.assertRaises(ValidationError):
            auto_allocate(pay, self.invoice)


class ReversalTests(LedgerTestCase):
    def test_reversal_restores_balance(self):
        pay = self._payment('100000')
        allocate_payment(pay, [(self.tuition, Decimal('100000'))])
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal('100000'))

        reverse_payment(pay, self.bursar, 'entered twice')
        pay.refresh_from_db()
        self.tuition.refresh_from_db()
        self.invoice.refresh_from_db()
        self.assertEqual(pay.status, PaymentStatus.REVERSED)
        self.assertEqual(self.tuition.amount_allocated, Decimal('0'))
        self.assertEqual(self.invoice.amount_paid, Decimal('0'))


class VoidLineTests(LedgerTestCase):
    def test_void_line_with_payment_creates_credit(self):
        pay = self._payment('40000')
        allocate_payment(pay, [(self.transport, Decimal('40000'))])

        void_line(self.transport, self.bursar, 'student left')
        self.transport.refresh_from_db()
        self.invoice.refresh_from_db()
        credit = StudentCredit.objects.get(student=self.student)
        self.assertEqual(self.transport.status, LineStatus.VOID)
        self.assertEqual(credit.remaining_amount, Decimal('40000'))
        # transport (100k) dropped out of the payable base
        self.assertEqual(self.invoice.amount_due, Decimal('320000'))


class PaymentEndpointTests(LedgerTestCase):
    def test_record_payment_with_explicit_allocations(self):
        client = APIClient()
        client.force_authenticate(user=self.bursar)
        resp = client.post('/api/fees/payments/', {
            'student': self.student.id,
            'amount': '4700',
            'payment_method': 'CASH',
            'paid_at': datetime.datetime.now().isoformat(),
            'allocations_input': [
                {'invoice_line': self.tuition.id, 'amount': '3000'},
                {'invoice_line': self.transport.id, 'amount': '1000'},
                {'invoice_line': self.activity.id, 'amount': '700'},
            ],
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)

        payment_id = resp.data['id']
        receipt = client.get(f'/api/fees/payments/{payment_id}/receipt/')
        cats = {a['category']: a['amount'] for a in receipt.data['allocations']}
        self.assertEqual(cats['TUITION'], '3000.00')
        self.assertEqual(cats['TRANSPORT'], '1000.00')
        self.assertEqual(cats['ACTIVITY'], '700.00')

    def test_record_payment_rejects_overpayment_via_api(self):
        client = APIClient()
        client.force_authenticate(user=self.bursar)
        resp = client.post('/api/fees/payments/', {
            'student': self.student.id,
            'amount': '30000',
            'payment_method': 'CASH',
            'paid_at': datetime.datetime.now().isoformat(),
            'allocations_input': [
                {'invoice_line': self.activity.id, 'amount': '30000'},
            ],
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_reverse_endpoint(self):
        client = APIClient()
        client.force_authenticate(user=self.bursar)
        pay = self._payment('20000')
        allocate_payment(pay, [(self.activity, Decimal('20000'))])
        resp = client.post(f'/api/fees/payments/{pay.id}/reverse/', {'reason': 'test'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.activity.refresh_from_db()
        self.assertEqual(self.activity.amount_allocated, Decimal('0'))
