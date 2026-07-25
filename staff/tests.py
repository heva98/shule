import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_academic_year, make_staff, make_student, make_user

from .models import ClassTeacherAssignment, Designation, DisciplinaryIncident, LeaveRequest


class StaffDirectoryPermissionTests(TestCase):
    """Staff records include salary and national ID — not a general directory."""

    def test_teacher_cannot_list_staff(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.get('/api/staff/')
        self.assertEqual(resp.status_code, 403)

    def test_academic_teacher_can_list_staff(self):
        academic_teacher = make_user(role=Role.ACADEMIC_TEACHER)
        client = APIClient()
        client.force_authenticate(user=academic_teacher)
        resp = client.get('/api/staff/')
        self.assertEqual(resp.status_code, 200)

    def test_teacher_cannot_create_staff(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.post('/api/staff/', {
            'full_name': 'New Teacher', 'email': 'newteacher@test.local',
            'designation': Designation.TEACHER, 'hire_date': str(datetime.date.today()),
            'contract_type': 'PERMANENT',
        }, format='json')
        self.assertEqual(resp.status_code, 403)


class LeaveRequestTests(TestCase):
    def test_staff_only_sees_own_leave_requests(self):
        staff_a = make_staff(role=Role.TEACHER)
        staff_b = make_staff(role=Role.TEACHER)
        LeaveRequest.objects.create(
            staff=staff_a, leave_type='ANNUAL', start_date=datetime.date.today(),
            end_date=datetime.date.today(), days_requested=1, reason='Personal',
        )
        LeaveRequest.objects.create(
            staff=staff_b, leave_type='ANNUAL', start_date=datetime.date.today(),
            end_date=datetime.date.today(), days_requested=1, reason='Personal',
        )
        client = APIClient()
        client.force_authenticate(user=staff_a.user)
        resp = client.get('/api/staff/leave/')
        self.assertEqual(resp.status_code, 200)
        staff_ids = [r['staff'] for r in resp.data['results']]
        self.assertEqual(staff_ids, [staff_a.id])

    def test_owner_sees_all_leave_requests(self):
        staff_a = make_staff(role=Role.TEACHER)
        LeaveRequest.objects.create(
            staff=staff_a, leave_type='ANNUAL', start_date=datetime.date.today(),
            end_date=datetime.date.today(), days_requested=1, reason='Personal',
        )
        owner = make_user(role=Role.OWNER)
        client = APIClient()
        client.force_authenticate(user=owner)
        resp = client.get('/api/staff/leave/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 1)

    def test_teacher_cannot_approve_leave(self):
        staff_a = make_staff(role=Role.TEACHER)
        leave = LeaveRequest.objects.create(
            staff=staff_a, leave_type='ANNUAL', start_date=datetime.date.today(),
            end_date=datetime.date.today(), days_requested=1, reason='Personal',
        )
        client = APIClient()
        client.force_authenticate(user=staff_a.user)
        resp = client.put(f'/api/staff/leave/{leave.id}/approve/', {}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_headteacher_can_approve_leave(self):
        staff_a = make_staff(role=Role.TEACHER)
        leave = LeaveRequest.objects.create(
            staff=staff_a, leave_type='ANNUAL', start_date=datetime.date.today(),
            end_date=datetime.date.today(), days_requested=1, reason='Personal',
        )
        headteacher = make_user(role=Role.HEADTEACHER)
        client = APIClient()
        client.force_authenticate(user=headteacher)
        resp = client.put(f'/api/staff/leave/{leave.id}/approve/', {}, format='json')
        self.assertEqual(resp.status_code, 200)
        leave.refresh_from_db()
        self.assertEqual(leave.status, 'APPROVED')


class ClassAssignmentPermissionTests(TestCase):
    def test_teacher_cannot_create_class_assignment(self):
        teacher_staff = make_staff(role=Role.TEACHER)
        ay = make_academic_year()
        client = APIClient()
        client.force_authenticate(user=teacher_staff.user)
        resp = client.post('/api/staff/class-assignments/', {
            'teacher_id': teacher_staff.id, 'level': 'STD1', 'stream': 'A',
            'academic_year_id': ay.id,
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_headteacher_can_create_class_assignment(self):
        teacher_staff = make_staff(role=Role.TEACHER)
        ay = make_academic_year()
        headteacher = make_user(role=Role.HEADTEACHER)
        client = APIClient()
        client.force_authenticate(user=headteacher)
        resp = client.post('/api/staff/class-assignments/', {
            'teacher_id': teacher_staff.id, 'level': 'STD1', 'stream': 'A',
            'academic_year_id': ay.id,
        }, format='json')
        self.assertEqual(resp.status_code, 201)


class DisciplinaryIncidentTests(TestCase):
    def test_teacher_cannot_create_incident(self):
        teacher = make_user(role=Role.TEACHER)
        student = make_student()
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.post('/api/staff/discipline/', {
            'student': student.id, 'date': str(datetime.date.today()),
            'incident_type': 'Fighting', 'description': 'Details', 'severity': 'MINOR',
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_discipline_teacher_can_create_incident(self):
        dt_staff = make_staff(role=Role.DISCIPLINE_TEACHER, designation=Designation.TEACHER)
        student = make_student()
        client = APIClient()
        client.force_authenticate(user=dt_staff.user)
        resp = client.post('/api/staff/discipline/', {
            'student': student.id, 'date': str(datetime.date.today()),
            'incident_type': 'Fighting', 'description': 'Details', 'severity': 'MINOR',
        }, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_discipline_teacher_only_sees_own_reported_incidents(self):
        dt_a = make_staff(role=Role.DISCIPLINE_TEACHER, designation=Designation.TEACHER)
        dt_b = make_staff(role=Role.DISCIPLINE_TEACHER, designation=Designation.TEACHER)
        student = make_student()
        DisciplinaryIncident.objects.create(
            student=student, reported_by=dt_a, date=datetime.date.today(),
            incident_type='Fighting', description='Details', severity='MINOR',
        )
        DisciplinaryIncident.objects.create(
            student=student, reported_by=dt_b, date=datetime.date.today(),
            incident_type='Vandalism', description='Details', severity='MAJOR',
        )
        client = APIClient()
        client.force_authenticate(user=dt_a.user)
        resp = client.get('/api/staff/discipline/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 1)


class MyClassViewTests(TestCase):
    def test_non_class_teacher_gets_403(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.get('/api/staff/my-class/')
        self.assertEqual(resp.status_code, 403)

    def test_class_teacher_with_no_assignment_gets_404(self):
        ct_staff = make_staff(role=Role.CLASS_TEACHER, designation=Designation.TEACHER)
        client = APIClient()
        client.force_authenticate(user=ct_staff.user)
        resp = client.get('/api/staff/my-class/')
        self.assertEqual(resp.status_code, 404)

    def test_class_teacher_with_assignment_gets_200(self):
        ct_staff = make_staff(role=Role.CLASS_TEACHER, designation=Designation.TEACHER)
        ay = make_academic_year()
        owner = make_user(role=Role.OWNER)
        ClassTeacherAssignment.objects.create(
            teacher=ct_staff, level='STD1', stream='A', academic_year=ay, assigned_by=owner,
        )
        client = APIClient()
        client.force_authenticate(user=ct_staff.user)
        resp = client.get('/api/staff/my-class/')
        self.assertEqual(resp.status_code, 200)
