import datetime

from django.test import TransactionTestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_academic_year, make_staff, make_user, run_concurrently
from staff.models import Designation

from .models import DayOfWeek, Period, TimetableEntry


class TimetableClashLockingTests(TransactionTestCase):
    """Regression test for the DB-level unique_teacher_per_timeslot constraint —
    two concurrent requests booking the same teacher into different classes at
    the same day/period must not both succeed."""

    def test_concurrent_booking_of_same_teacher_same_slot_only_one_succeeds(self):
        owner = make_user(role=Role.OWNER)
        academic_year = make_academic_year()
        period = Period.objects.create(
            name='Period 1', start_time='08:00', end_time='08:40', order=1,
        )
        teacher = make_staff(role=Role.TEACHER, designation=Designation.TEACHER)

        def schedule(level):
            client = APIClient()
            client.force_authenticate(user=owner)
            resp = client.post('/api/timetable/entries/', {
                'academic_year': academic_year.id,
                'level': level,
                'stream': '',
                'day_of_week': DayOfWeek.MONDAY,
                'period': period.id,
                'teacher': teacher.id,
                'room': 'Room A',
            }, format='json')
            return resp.status_code

        codes = run_concurrently(lambda: schedule('STD1'), lambda: schedule('STD2'))

        self.assertEqual(sorted(codes), [201, 400])
        self.assertEqual(
            TimetableEntry.objects.filter(teacher=teacher, academic_year=academic_year,
                                           day_of_week=DayOfWeek.MONDAY, period=period).count(),
            1,
        )


class TimetablePermissionTests(TransactionTestCase):
    def setUp(self):
        self.academic_year = make_academic_year()
        self.period = Period.objects.create(
            name='Period 1', start_time='08:00', end_time='08:40', order=1,
        )
        self.teacher = make_staff(role=Role.TEACHER, designation=Designation.TEACHER)

    def _payload(self):
        return {
            'academic_year': self.academic_year.id,
            'level': 'STD1',
            'stream': '',
            'day_of_week': DayOfWeek.MONDAY,
            'period': self.period.id,
            'teacher': self.teacher.id,
            'room': 'Room A',
        }

    def test_disallowed_role_cannot_create_entry(self):
        teacher_user = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher_user)
        resp = client.post('/api/timetable/entries/', self._payload(), format='json')
        self.assertEqual(resp.status_code, 403)

    def test_senior_staff_can_create_entry(self):
        academic_teacher = make_user(role=Role.ACADEMIC_TEACHER)
        client = APIClient()
        client.force_authenticate(user=academic_teacher)
        resp = client.post('/api/timetable/entries/', self._payload(), format='json')
        self.assertEqual(resp.status_code, 201)

    def test_any_authenticated_user_can_read_timetable(self):
        parent = make_user(role=Role.PARENT)
        client = APIClient()
        client.force_authenticate(user=parent)
        resp = client.get('/api/timetable/entries/')
        self.assertEqual(resp.status_code, 200)
