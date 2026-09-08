import datetime
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role
from boarding.models import BoardingAssignment, Dormitory
from shule.factories import make_academic_year, make_student, make_user
from transport.models import Route, RouteFee, TransportAssignment

from .charges import assign_uniform, generate_charges, generate_for_student
from .models import (
    ActivityFeePlan,
    FeeCategory,
    Invoice,
    InvoiceKind,
    InvoiceLine,
    LineStatus,
    LunchFeeConfig,
    Payment,
    TuitionFeePlan,
    UniformFeePlan,
)
from .services import allocate_payment
from .summaries import student_fee_summary


class EngineBase(TestCase):
    def setUp(self):
        self.year = make_academic_year()
        self.bursar = make_user(role=Role.BURSAR)
        self.s1 = make_student(level='STD3')
        self.s2 = make_student(level='STD3')

    def _tuition(self, amount, scope='LEVEL_GROUP', **kw):
        return TuitionFeePlan.objects.create(
            academic_year=self.year, scope=scope, amount=Decimal(amount),
            level_group=kw.get('level_group', 'PRIMARY' if scope == 'LEVEL_GROUP' else ''),
            level=kw.get('level', ''),
        )

    def _line(self, student, category, kind=InvoiceKind.ANNUAL, term=None, quarter=None):
        return InvoiceLine.objects.filter(
            invoice__student=student, invoice__kind=kind, category=category,
        ).exclude(status=LineStatus.VOID).first()


class AnnualGenerationTests(EngineBase):
    def test_no_plan_means_no_invoice(self):
        generate_charges(self.year, 'ANNUAL')
        self.assertFalse(Invoice.objects.filter(kind=InvoiceKind.ANNUAL).exists())

    def test_tuition_line_created_from_group_plan(self):
        self._tuition('500000')
        stats = generate_charges(self.year, 'ANNUAL')
        self.assertEqual(stats['created'], 2)
        line = self._line(self.s1, FeeCategory.TUITION)
        self.assertEqual(line.amount, Decimal('500000'))
        self.assertEqual(line.source_kind, 'tuition_plan')
        self.assertEqual(line.level_snapshot, 'STD3')

    def test_level_override_beats_group(self):
        self._tuition('500000')
        self._tuition('550000', scope='LEVEL', level='STD3')
        generate_charges(self.year, 'ANNUAL')
        self.assertEqual(self._line(self.s1, FeeCategory.TUITION).amount, Decimal('550000'))

    def test_idempotent_rerun(self):
        self._tuition('500000')
        generate_charges(self.year, 'ANNUAL')
        stats = generate_charges(self.year, 'ANNUAL')
        self.assertEqual(stats['created'], 0)
        self.assertEqual(
            InvoiceLine.objects.filter(category=FeeCategory.TUITION).count(), 2
        )

    def test_config_change_before_payment_refreshes_amount(self):
        plan = self._tuition('500000')
        generate_charges(self.year, 'ANNUAL')
        plan.amount = Decimal('520000')
        plan.save()
        stats = generate_charges(self.year, 'ANNUAL')
        self.assertEqual(stats['updated'], 2)
        self.assertEqual(self._line(self.s1, FeeCategory.TUITION).amount, Decimal('520000'))

    def test_config_change_after_payment_keeps_snapshot(self):
        plan = self._tuition('500000')
        generate_charges(self.year, 'ANNUAL')
        line = self._line(self.s1, FeeCategory.TUITION)
        pay = Payment.objects.create(
            student=self.s1, amount=Decimal('100000'), payment_method='CASH',
            paid_at=datetime.datetime.now(), received_by=self.bursar,
        )
        allocate_payment(pay, [(line, Decimal('100000'))])
        plan.amount = Decimal('520000')
        plan.save()
        stats = generate_charges(self.year, 'ANNUAL')
        line.refresh_from_db()
        self.assertEqual(line.amount, Decimal('500000'))
        self.assertEqual(stats['skipped_paid'], 1)


class QuarterlyGenerationTests(EngineBase):
    def setUp(self):
        super().setUp()
        LunchFeeConfig.objects.create(
            academic_year=self.year, term='TERM1', quarter='Q1',
            day_amount=Decimal('70000'), boarding_amount=Decimal('100000'),
        )
        ActivityFeePlan.objects.create(
            academic_year=self.year, term='TERM1', quarter='Q1', level='STD3',
            amount=Decimal('20000'),
        )
        dorm = Dormitory.objects.create(name='Simba', gender='M', capacity=40)
        BoardingAssignment.objects.create(
            student=self.s2, dormitory=dorm, academic_year=self.year, assigned_by=self.bursar,
        )
        route = Route.objects.create(name='R1', capacity=20)
        RouteFee.objects.create(
            route=route, academic_year=self.year, term='TERM1', quarter='Q1',
            amount=Decimal('80000'),
        )
        TransportAssignment.objects.create(
            student=self.s1, route=route, academic_year=self.year, assigned_by=self.bursar,
        )

    def _gen(self):
        return generate_charges(self.year, 'QUARTERLY', term='TERM1', quarter='Q1')

    def test_day_student_gets_lunch_transport_activity(self):
        self._gen()
        q = dict(kind=InvoiceKind.QUARTERLY, term='TERM1', quarter='Q1')
        self.assertEqual(self._line(self.s1, FeeCategory.LUNCH, **q).amount, Decimal('70000'))
        self.assertEqual(self._line(self.s1, FeeCategory.TRANSPORT, **q).amount, Decimal('80000'))
        self.assertEqual(self._line(self.s1, FeeCategory.ACTIVITY, **q).amount, Decimal('20000'))

    def test_boarder_gets_boarding_lunch_no_transport(self):
        self._gen()
        q = dict(kind=InvoiceKind.QUARTERLY, term='TERM1', quarter='Q1')
        self.assertEqual(self._line(self.s2, FeeCategory.LUNCH, **q).amount, Decimal('100000'))
        self.assertIsNone(self._line(self.s2, FeeCategory.TRANSPORT, **q))

    def test_category_stops_applying_voids_unpaid_line(self):
        self._gen()
        q = dict(kind=InvoiceKind.QUARTERLY, term='TERM1', quarter='Q1')
        self.assertIsNotNone(self._line(self.s1, FeeCategory.TRANSPORT, **q))
        # s1 moves into boarding → transport no longer applies
        dorm = Dormitory.objects.get(name='Simba')
        BoardingAssignment.objects.create(
            student=self.s1, dormitory=dorm, academic_year=self.year, assigned_by=self.bursar,
        )
        stats = self._gen()
        self.assertEqual(stats['voided'], 1)
        self.assertIsNone(self._line(self.s1, FeeCategory.TRANSPORT, **q))


class UniformAssignTests(EngineBase):
    def setUp(self):
        super().setUp()
        UniformFeePlan.objects.create(
            academic_year=self.year, level='STD3', amount=Decimal('50000')
        )

    def test_engine_never_auto_creates_uniform(self):
        self._tuition('500000')
        generate_charges(self.year, 'ANNUAL')
        self.assertIsNone(self._line(self.s1, FeeCategory.UNIFORM))

    def test_assign_uniform_creates_line_at_plan_amount(self):
        stats = assign_uniform(self.year, [self.s1], created_by=self.bursar)
        self.assertEqual(stats['created'], 1)
        line = self._line(self.s1, FeeCategory.UNIFORM)
        self.assertEqual(line.amount, Decimal('50000'))
        self.assertEqual(line.source_kind, 'uniform_plan')

    def test_override_marks_manual_and_engine_leaves_it(self):
        assign_uniform(self.year, [self.s1], amount_override=Decimal('35000'), created_by=self.bursar)
        line = self._line(self.s1, FeeCategory.UNIFORM)
        self.assertEqual(line.amount, Decimal('35000'))
        self.assertEqual(line.source_kind, 'uniform_manual')
        # a plan amount change + engine rerun must not touch the manual line
        UniformFeePlan.objects.filter(level='STD3').update(amount=Decimal('99999'))
        self._tuition('500000')
        generate_charges(self.year, 'ANNUAL')
        line.refresh_from_db()
        self.assertEqual(line.amount, Decimal('35000'))


class SummaryTests(EngineBase):
    def test_summary_spans_annual_and_quarterly(self):
        self._tuition('500000')
        LunchFeeConfig.objects.create(
            academic_year=self.year, term='TERM1', quarter='Q1',
            day_amount=Decimal('70000'), boarding_amount=Decimal('100000'),
        )
        generate_charges(self.year, 'ANNUAL')
        generate_charges(self.year, 'QUARTERLY', term='TERM1', quarter='Q1')

        line = self._line(self.s1, FeeCategory.TUITION)
        pay = Payment.objects.create(
            student=self.s1, amount=Decimal('200000'), payment_method='CASH',
            paid_at=datetime.datetime.now(), received_by=self.bursar,
        )
        allocate_payment(pay, [(line, Decimal('200000'))])

        summary = student_fee_summary(self.s1, self.year)
        cats = {c['category']: c for c in summary['categories']}
        self.assertEqual(cats['TUITION']['required'], '500000.00')
        self.assertEqual(cats['TUITION']['paid'], '200000.00')
        self.assertEqual(cats['TUITION']['outstanding'], '300000.00')
        self.assertEqual(cats['LUNCH']['outstanding'], '70000.00')
        self.assertEqual(summary['totals']['required'], '570000.00')
        self.assertEqual(summary['totals']['outstanding'], '370000.00')


class EngineApiTests(EngineBase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(user=self.bursar)
        self._tuition('500000')

    def test_generate_endpoint(self):
        resp = self.client.post('/api/fees/charges/generate/', {
            'academic_year': self.year.id, 'scope': 'ANNUAL',
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['created'], 2)

    def test_generate_quarterly_requires_period(self):
        resp = self.client.post('/api/fees/charges/generate/', {
            'academic_year': self.year.id, 'scope': 'QUARTERLY',
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_assign_uniform_endpoint(self):
        UniformFeePlan.objects.create(
            academic_year=self.year, level='STD3', amount=Decimal('50000')
        )
        resp = self.client.post('/api/fees/charges/assign-uniform/', {
            'academic_year': self.year.id, 'student_ids': [self.s1.id],
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['created'], 1)

    def test_student_summary_endpoint(self):
        generate_charges(self.year, 'ANNUAL')
        resp = self.client.get('/api/fees/student-summary/', {
            'student': self.s1.id, 'academic_year': self.year.id,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['totals']['required'], '500000.00')

    def test_void_line_endpoint(self):
        generate_charges(self.year, 'ANNUAL')
        line = self._line(self.s1, FeeCategory.TUITION)
        resp = self.client.post(f'/api/fees/invoice-lines/{line.id}/void/', {'reason': 'left'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        line.refresh_from_db()
        self.assertEqual(line.status, LineStatus.VOID)

    def test_cannot_edit_paid_line(self):
        generate_charges(self.year, 'ANNUAL')
        line = self._line(self.s1, FeeCategory.TUITION)
        pay = Payment.objects.create(
            student=self.s1, amount=Decimal('10000'), payment_method='CASH',
            paid_at=datetime.datetime.now(), received_by=self.bursar,
        )
        allocate_payment(pay, [(line, Decimal('10000'))])
        resp = self.client.patch(f'/api/fees/invoice-lines/{line.id}/', {'amount': '9'}, format='json')
        self.assertEqual(resp.status_code, 400)


class SyncTaskTests(EngineBase):
    def test_sync_student_charges_covers_opened_quarter(self):
        from .tasks import sync_student_charges

        self._tuition('500000')
        LunchFeeConfig.objects.create(
            academic_year=self.year, term='TERM1', quarter='Q1',
            day_amount=Decimal('70000'), boarding_amount=Decimal('100000'),
        )
        # open Q1 for the class via the other student
        generate_for_student(self.s2, self.year, scope=InvoiceKind.QUARTERLY,
                             term='TERM1', quarter='Q1')

        result = sync_student_charges.run(self.s1.id)
        self.assertGreaterEqual(result['created'], 2)  # tuition + lunch
        self.assertIsNotNone(
            self._line(self.s1, FeeCategory.LUNCH, kind=InvoiceKind.QUARTERLY,
                       term='TERM1', quarter='Q1')
        )
