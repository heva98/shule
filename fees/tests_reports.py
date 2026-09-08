import datetime
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_academic_year, make_student, make_user

from . import reports
from .models import (
    FeeAdjustment,
    FeeCategory,
    Invoice,
    InvoiceKind,
    InvoiceLine,
    Payment,
)
from .sales import create_uniform_sale
from .services import allocate_payment, reverse_payment, void_line


def _pay(student, bursar, splits, method='CASH'):
    p = Payment.objects.create(
        student=student, amount=sum(a for _, a in splits), payment_method=method,
        paid_at=datetime.datetime(2026, 2, 10, 9, 0), received_by=bursar,
    )
    allocate_payment(p, splits)
    return p


class ReportsFixture(TestCase):
    def setUp(self):
        self.year = make_academic_year()
        self.bursar = make_user(role=Role.BURSAR)
        self.a = make_student(level='STD3', first_name='Aisha')
        self.b = make_student(level='STD4', first_name='Baraka')

        # annual tuition
        self.a_tui = self._line(self.a, InvoiceKind.ANNUAL, FeeCategory.TUITION, '300000')
        self.b_tui = self._line(self.b, InvoiceKind.ANNUAL, FeeCategory.TUITION, '300000')
        # quarterly lunch + transport (TERM1/Q1)
        self.a_lunch = self._line(self.a, InvoiceKind.QUARTERLY, FeeCategory.LUNCH, '70000',
                                  term='TERM1', quarter='Q1')
        self.a_trans = self._line(self.a, InvoiceKind.QUARTERLY, FeeCategory.TRANSPORT, '80000',
                                  term='TERM1', quarter='Q1')
        self.b_lunch = self._line(self.b, InvoiceKind.QUARTERLY, FeeCategory.LUNCH, '70000',
                                  term='TERM1', quarter='Q1')

        # payments
        _pay(self.a, self.bursar, [(self.a_tui, Decimal('100000')),
                                   (self.a_lunch, Decimal('70000'))])
        _pay(self.b, self.bursar, [(self.b_tui, Decimal('50000'))])
        # a reversed payment that must not count
        rev = _pay(self.b, self.bursar, [(self.b_lunch, Decimal('70000'))])
        reverse_payment(rev, self.bursar, 'mistake')

        # a waiver on B's tuition
        FeeAdjustment.objects.create(
            invoice_line=self.b_tui, kind=FeeAdjustment.Kind.WAIVER,
            amount=Decimal('50000'), reason='hardship', approved_by=self.bursar,
        )

        # a uniform walk-in sale, paid — revenue but not billed fees
        sale_line = create_uniform_sale(
            self.a, [{'name': 'Shirt', 'qty': 1, 'unit_price': '25000'}],
            academic_year=self.year, created_by=self.bursar,
        )
        _pay(self.a, self.bursar, [(sale_line, Decimal('25000'))])

    def _line(self, student, kind, category, amount, term=None, quarter=None):
        inv, _ = Invoice.objects.get_or_create(
            student=student, academic_year=self.year, kind=kind,
            term=term, quarter=quarter,
            defaults={'due_date': datetime.date(2026, 3, 1)},
        )
        return InvoiceLine.objects.create(
            invoice=inv, category=category, amount=Decimal(amount),
            level_snapshot=student.level,
        )


class CollectionsTests(ReportsFixture):
    def test_by_category_includes_sale_excludes_reversed(self):
        r = reports.collections(academic_year=self.year.id, group_by='category')
        got = {row['key']: Decimal(row['collected']) for row in r['rows']}
        self.assertEqual(got[FeeCategory.TUITION], Decimal('150000'))   # 100k + 50k
        self.assertEqual(got[FeeCategory.LUNCH], Decimal('70000'))       # reversed 70k excluded
        self.assertEqual(got[FeeCategory.UNIFORM], Decimal('25000'))     # sale counted
        self.assertEqual(Decimal(r['total_collected']), Decimal('245000'))

    def test_term_filter_excludes_annual_tuition(self):
        r = reports.collections(academic_year=self.year.id, term='TERM1', group_by='category')
        got = {row['key']: Decimal(row['collected']) for row in r['rows']}
        self.assertNotIn(FeeCategory.TUITION, got)
        self.assertEqual(got.get(FeeCategory.LUNCH), Decimal('70000'))


class OutstandingTests(ReportsFixture):
    def test_by_category_respects_waiver(self):
        r = reports.outstanding(academic_year=self.year.id, group_by='category')
        got = {row['key']: row for row in r['rows']}
        # A tuition 300k-100k=200k ; B tuition 300k-50k(waiver)-50k(paid)=200k
        self.assertEqual(Decimal(got[FeeCategory.TUITION]['outstanding']), Decimal('400000'))
        self.assertEqual(Decimal(got[FeeCategory.TUITION]['required']), Decimal('550000'))
        # lunch: A paid, B reversed -> both outstanding 70k? A lunch fully paid.
        self.assertEqual(Decimal(got[FeeCategory.LUNCH]['outstanding']), Decimal('70000'))

    def test_uniform_sale_not_in_outstanding(self):
        r = reports.outstanding(academic_year=self.year.id, group_by='category')
        self.assertNotIn(FeeCategory.UNIFORM, {row['key'] for row in r['rows']})


class UnpaidStudentsTests(ReportsFixture):
    def test_lists_students_owing_transport(self):
        rows = reports.unpaid_students(category=FeeCategory.TRANSPORT, academic_year=self.year.id)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['student_id'], self.a.student_id)
        self.assertEqual(Decimal(rows[0]['outstanding']), Decimal('80000'))

    def test_void_line_drops_out(self):
        void_line(self.a_trans, self.bursar, 'left route')
        rows = reports.unpaid_students(category=FeeCategory.TRANSPORT, academic_year=self.year.id)
        self.assertEqual(rows, [])


class OverviewApiTests(ReportsFixture):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(user=self.bursar)

    def test_overview_endpoint(self):
        resp = self.client.get('/api/fees/reports/overview/', {'academic_year': self.year.id})
        self.assertEqual(resp.status_code, 200)
        t = resp.data['totals']
        self.assertEqual(Decimal(t['collected']), Decimal('245000'))
        # 400k tuition + 70k lunch (B, reversed) + 80k transport (A)
        self.assertEqual(Decimal(t['outstanding']), Decimal('550000'))
        self.assertTrue(any(c['category'] == 'TUITION' for c in resp.data['by_category']))

    def test_reports_forbidden_for_teacher(self):
        c = APIClient()
        c.force_authenticate(user=make_user(role=Role.TEACHER))
        self.assertEqual(c.get('/api/fees/reports/overview/').status_code, 403)

    def test_unpaid_endpoint_requires_category(self):
        self.assertEqual(
            self.client.get('/api/fees/reports/unpaid/').status_code, 400
        )
