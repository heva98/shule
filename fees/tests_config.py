import datetime
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role
from boarding.models import BoardingAssignment, Dormitory
from shule.factories import make_academic_year, make_student, make_user
from transport.models import Route, RouteFee, TransportAssignment

from .models import ActivityFeePlan, LunchFeeConfig, TuitionFeePlan, UniformFeePlan


class FeeConfigApiTests(TestCase):
    def setUp(self):
        self.year = make_academic_year()
        self.bursar = make_user(role=Role.BURSAR)
        self.client = APIClient()
        self.client.force_authenticate(user=self.bursar)

    def test_teacher_cannot_touch_fee_config(self):
        teacher = make_user(role=Role.TEACHER)
        c = APIClient()
        c.force_authenticate(user=teacher)
        self.assertEqual(c.get('/api/fees/config/tuition/').status_code, 403)
        self.assertEqual(
            c.post('/api/fees/config/lunch/', {}, format='json').status_code, 403
        )

    def test_create_tuition_plan_for_level_group(self):
        resp = self.client.post('/api/fees/config/tuition/', {
            'academic_year': self.year.id, 'scope': 'LEVEL_GROUP',
            'level_group': 'PRIMARY', 'amount': '500000',
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['level'], '')

    def test_tuition_plan_level_group_requires_group(self):
        resp = self.client.post('/api/fees/config/tuition/', {
            'academic_year': self.year.id, 'scope': 'LEVEL_GROUP', 'amount': '1',
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_lunch_config_rejects_mismatched_quarter(self):
        resp = self.client.post('/api/fees/config/lunch/', {
            'academic_year': self.year.id, 'term': 'TERM1', 'quarter': 'Q3',
            'day_amount': '70000', 'boarding_amount': '100000',
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_activity_plan_crud(self):
        resp = self.client.post('/api/fees/config/activity/', {
            'academic_year': self.year.id, 'term': 'TERM1', 'quarter': 'Q1',
            'level': 'STD1', 'amount': '20000',
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        pk = resp.data['id']
        resp = self.client.patch(f'/api/fees/config/activity/{pk}/', {'amount': '25000'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['amount'], '25000.00')


class FeeConfigResolveTests(TestCase):
    def setUp(self):
        self.year = make_academic_year()
        self.bursar = make_user(role=Role.BURSAR)
        self.client = APIClient()
        self.client.force_authenticate(user=self.bursar)

        self.day_student = make_student(level='STD3')
        self.boarder = make_student(level='STD3')

        dorm = Dormitory.objects.create(name='Simba', gender='M', capacity=50)
        BoardingAssignment.objects.create(
            student=self.boarder, dormitory=dorm, academic_year=self.year,
            assigned_by=self.bursar,
        )

        TuitionFeePlan.objects.create(
            academic_year=self.year, scope='LEVEL_GROUP', level_group='PRIMARY',
            amount=Decimal('500000'),
        )
        TuitionFeePlan.objects.create(
            academic_year=self.year, scope='LEVEL', level='STD3',
            amount=Decimal('550000'),
        )
        LunchFeeConfig.objects.create(
            academic_year=self.year, term='TERM1', quarter='Q1',
            day_amount=Decimal('70000'), boarding_amount=Decimal('100000'),
        )
        ActivityFeePlan.objects.create(
            academic_year=self.year, term='TERM1', quarter='Q1', level='STD3',
            amount=Decimal('20000'),
        )

        route = Route.objects.create(name='Route 1', capacity=30)
        RouteFee.objects.create(
            route=route, academic_year=self.year, term='TERM1', quarter='Q1',
            amount=Decimal('80000'),
        )
        TransportAssignment.objects.create(
            student=self.day_student, route=route, academic_year=self.year,
            assigned_by=self.bursar,
        )
        TransportAssignment.objects.create(
            student=self.boarder, route=route, academic_year=self.year,
            assigned_by=self.bursar,
        )

    def _resolve(self, student):
        return self.client.get('/api/fees/config/resolve/', {
            'student': student.id, 'academic_year': self.year.id,
            'term': 'TERM1', 'quarter': 'Q1',
        }).data

    def test_level_override_beats_group(self):
        data = self._resolve(self.day_student)
        self.assertEqual(data['annual']['TUITION'], '550000.00')

    def test_day_student_gets_day_lunch_and_transport(self):
        data = self._resolve(self.day_student)
        self.assertFalse(data['is_boarding'])
        self.assertEqual(data['quarterly']['LUNCH'], '70000.00')
        self.assertEqual(data['quarterly']['TRANSPORT'], '80000.00')
        self.assertEqual(data['quarterly']['ACTIVITY'], '20000.00')

    def test_boarder_gets_boarding_lunch_and_no_transport(self):
        data = self._resolve(self.boarder)
        self.assertTrue(data['is_boarding'])
        self.assertEqual(data['quarterly']['LUNCH'], '100000.00')
        self.assertIsNone(data['quarterly']['TRANSPORT'])

    def test_uniform_none_when_unconfigured(self):
        data = self._resolve(self.day_student)
        self.assertIsNone(data['annual']['UNIFORM'])
        UniformFeePlan.objects.create(
            academic_year=self.year, level='STD3', amount=Decimal('50000')
        )
        self.assertEqual(self._resolve(self.day_student)['annual']['UNIFORM'], '50000.00')
