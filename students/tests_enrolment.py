import datetime
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from fees.models import AcademicYear
from shule.factories import make_academic_year, make_student

from .enrolment import open_year, record_enrolment
from .models import Enrolment, StudentStatus


def _today(d):
    return mock.patch('students.enrolment.timezone.localdate', return_value=d)


class EnrolmentTrackingTests(TestCase):
    def setUp(self):
        self.y2026 = make_academic_year(year=2026, is_current=True)

    def test_new_student_gets_current_year_row(self):
        student = make_student(level='STD3', stream='A')
        row = Enrolment.objects.get(student=student)
        self.assertEqual((row.academic_year, row.level, row.stream, row.status),
                         (self.y2026, 'STD3', 'A', StudentStatus.ACTIVE))

    def test_no_current_year_records_nothing(self):
        AcademicYear.objects.update(is_current=False)
        make_student()
        self.assertFalse(Enrolment.objects.exists())

    def test_mid_year_class_change_updates_current_row(self):
        student = make_student(level='STD3', stream='A')
        student.stream = 'B'
        student.save()
        self.assertEqual(Enrolment.objects.get(student=student).stream, 'B')
        self.assertEqual(Enrolment.objects.count(), 1)

    def test_promotion_after_year_switch_preserves_last_year(self):
        student = make_student(level='STD3', stream='A')

        y2027 = AcademicYear.objects.create(year=2027, is_current=True)
        student.refresh_from_db()
        student.level = 'STD4'
        student.save()

        old = Enrolment.objects.get(student=student, academic_year=self.y2026)
        new = Enrolment.objects.get(student=student, academic_year=y2027)
        self.assertEqual(old.level, 'STD3')
        self.assertEqual(new.level, 'STD4')

    def test_year_switch_via_update_then_save_seeds_rows(self):
        # Mirrors AdminAcademicYearSetCurrentView.
        student = make_student(level='FORM1')
        y2027 = make_academic_year(year=2027, is_current=False)
        AcademicYear.objects.filter(is_current=True).update(is_current=False)
        y2027.is_current = True
        y2027.save(update_fields=['is_current'])
        self.assertTrue(Enrolment.objects.filter(student=student, academic_year=y2027).exists())

    def test_leaving_sets_left_on_and_is_not_carried_forward(self):
        student = make_student(level='STD7')
        with _today(datetime.date(2026, 11, 20)):
            student.status = StudentStatus.GRADUATED
            student.save()
        row = Enrolment.objects.get(student=student, academic_year=self.y2026)
        self.assertEqual(row.status, StudentStatus.GRADUATED)
        self.assertEqual(row.left_on, datetime.date(2026, 11, 20))

        y2027 = AcademicYear.objects.create(year=2027, is_current=True)
        self.assertFalse(Enrolment.objects.filter(academic_year=y2027).exists())

    def test_left_on_kept_across_status_corrections_and_cleared_on_reinstatement(self):
        student = make_student()
        with _today(datetime.date(2026, 5, 1)):
            student.status = StudentStatus.TRANSFERRED
            student.save()
        with _today(datetime.date(2026, 5, 9)):
            student.status = StudentStatus.EXPELLED
            student.save()
        row = Enrolment.objects.get(student=student)
        self.assertEqual(row.left_on, datetime.date(2026, 5, 1))

        student.status = StudentStatus.ACTIVE
        student.save()
        row.refresh_from_db()
        self.assertIsNone(row.left_on)

    def test_suspended_student_stays_enrolled(self):
        student = make_student()
        student.status = StudentStatus.SUSPENDED
        student.save()
        self.assertIsNone(Enrolment.objects.get(student=student).left_on)

    def test_closed_year_is_frozen(self):
        student = make_student(level='STD3')
        self.y2026.q4_end = datetime.date(2026, 12, 5)
        self.y2026.save()

        with _today(datetime.date(2026, 12, 20)):
            student.level = 'STD4'  # promoted before the year was switched
            student.save()
        self.assertEqual(Enrolment.objects.get(student=student).level, 'STD3')

        y2027 = AcademicYear.objects.create(year=2027, is_current=True)
        self.assertEqual(Enrolment.objects.get(student=student, academic_year=y2027).level, 'STD4')

    def test_left_student_without_row_is_not_enrolled(self):
        student = make_student(status=StudentStatus.GRADUATED)
        self.assertFalse(Enrolment.objects.filter(student=student).exists())
        self.assertIsNone(record_enrolment(student))


class OpenYearTests(TestCase):
    def test_idempotent_and_uses_q1_start(self):
        year = make_academic_year(year=2026, is_current=False)
        year.q1_start = datetime.date(2026, 1, 12)
        year.save()
        make_student()
        make_student()

        self.assertEqual(open_year(year), 2)
        self.assertEqual(open_year(year), 0)
        self.assertEqual(
            set(Enrolment.objects.filter(academic_year=year).values_list('enrolled_on', flat=True)),
            {datetime.date(2026, 1, 12)},
        )

    def test_snapshot_command(self):
        make_academic_year(year=2026, is_current=True)
        student = make_student()
        Enrolment.objects.filter(student=student).delete()

        out = StringIO()
        call_command('snapshot_enrolments', stdout=out)
        self.assertIn('created 1', out.getvalue())
        self.assertTrue(Enrolment.objects.filter(student=student).exists())


class EnrolmentEndpointTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        from accounts.models import Role
        from shule.factories import make_user

        self.Role, self.make_user = Role, make_user
        self.client = APIClient()
        make_academic_year(year=2026, is_current=True)
        self.student = make_student(level='STD3', stream='A')
        AcademicYear.objects.create(year=2027, is_current=True)
        self.student.refresh_from_db()
        self.student.level = 'STD4'
        self.student.save()
        self.url = f'/api/students/{self.student.public_id}/enrolments/'

    def test_staff_sees_history_newest_first(self):
        self.client.force_authenticate(self.make_user(role=self.Role.TEACHER))
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            [(r['academic_year'], r['level'], r['is_current']) for r in resp.data],
            [(2027, 'STD4', True), (2026, 'STD3', False)],
        )

    def test_parent_is_refused(self):
        self.client.force_authenticate(self.make_user(role=self.Role.PARENT))
        self.assertEqual(self.client.get(self.url).status_code, 403)
