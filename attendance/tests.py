import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_student, make_user
from students.models import Guardian

from .models import AttendanceRecord, AttendanceStatus


class AttendanceParentScopingTests(TestCase):
    """A parent must only ever see attendance for their own children."""

    def setUp(self):
        self.own_child = make_student()
        Guardian.objects.create(
            student=self.own_child, full_name='Parent', relationship='FATHER',
            phone='+255712340002', email='parent2@test.local',
        )
        self.other_child = make_student()
        self.parent = make_user(role=Role.PARENT, phone='+255712340002', email='parent2@test.local')
        marker = make_user(role=Role.TEACHER)

        self.own_record = AttendanceRecord.objects.create(
            student=self.own_child, date=datetime.date.today(), session='MORNING',
            status=AttendanceStatus.PRESENT, marked_by=marker,
        )
        self.other_record = AttendanceRecord.objects.create(
            student=self.other_child, date=datetime.date.today(), session='MORNING',
            status=AttendanceStatus.PRESENT, marked_by=marker,
        )

    def test_parent_sees_only_own_childs_records_in_list(self):
        client = APIClient()
        client.force_authenticate(user=self.parent)
        resp = client.get('/api/attendance/')
        self.assertEqual(resp.status_code, 200)
        ids = [r['id'] for r in resp.data['results']]
        self.assertIn(self.own_record.id, ids)
        self.assertNotIn(self.other_record.id, ids)

    def test_parent_cannot_see_other_childs_records_via_student_param(self):
        client = APIClient()
        client.force_authenticate(user=self.parent)
        resp = client.get(f'/api/attendance/?student={self.other_child.id}')
        self.assertEqual(resp.status_code, 200)
        ids = [r['id'] for r in resp.data['results']]
        self.assertEqual(ids, [])

    def test_parent_can_view_own_childs_summary(self):
        client = APIClient()
        client.force_authenticate(user=self.parent)
        resp = client.get(f'/api/attendance/summary/?student={self.own_child.id}')
        self.assertEqual(resp.status_code, 200)

    def test_parent_cannot_view_other_childs_summary(self):
        client = APIClient()
        client.force_authenticate(user=self.parent)
        resp = client.get(f'/api/attendance/summary/?student={self.other_child.id}')
        self.assertEqual(resp.status_code, 403)


class AttendancePermissionTests(TestCase):
    def test_bursar_cannot_list_attendance(self):
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.get('/api/attendance/')
        self.assertEqual(resp.status_code, 403)

    def test_teacher_can_list_attendance(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.get('/api/attendance/')
        self.assertEqual(resp.status_code, 200)

    def test_bursar_can_view_daily_summary(self):
        # Aggregate, no-PII stat shown on the Bursar's dashboard too.
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.get('/api/attendance/daily-summary/')
        self.assertEqual(resp.status_code, 200)

    def test_bursar_cannot_view_absentees(self):
        # Guardian contact PII — Bursar has no legitimate need for this.
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.get(f'/api/attendance/absentees/?date={datetime.date.today()}')
        self.assertEqual(resp.status_code, 403)

    def test_teacher_can_mark_bulk_attendance(self):
        student = make_student(level='STD1')
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.post('/api/attendance/bulk/', {
            'date': str(datetime.date.today()),
            'session': 'MORNING',
            'records': [{'student_id': student.student_id, 'status': 'PRESENT'}],
        }, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_bursar_cannot_mark_bulk_attendance(self):
        student = make_student(level='STD1')
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.post('/api/attendance/bulk/', {
            'date': str(datetime.date.today()),
            'session': 'MORNING',
            'records': [{'student_id': student.student_id, 'status': 'PRESENT'}],
        }, format='json')
        self.assertEqual(resp.status_code, 403)
