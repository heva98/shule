import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_student, make_user

from .models import Guardian


class StudentLookupTests(TestCase):
    """The opaque public_id must work as the lookup key; the sequential pk
    must not — that's the whole point of the public_id security decision."""

    def test_retrieve_by_public_id_succeeds(self):
        viewer = make_user(role=Role.TEACHER)
        student = make_student()
        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get(f'/api/students/{student.public_id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['id'], student.id)

    def test_retrieve_by_raw_pk_fails(self):
        viewer = make_user(role=Role.TEACHER)
        student = make_student()
        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.get(f'/api/students/{student.id}/')
        self.assertEqual(resp.status_code, 404)


class StudentPermissionTests(TestCase):
    def setUp(self):
        self.student = make_student()

    def _create_payload(self):
        return {
            'first_name': 'New', 'last_name': 'Student',
            'date_of_birth': '2013-05-01', 'gender': 'F', 'level': 'STD1',
        }

    def test_parent_cannot_list_students(self):
        parent = make_user(role=Role.PARENT)
        client = APIClient()
        client.force_authenticate(user=parent)
        resp = client.get('/api/students/')
        self.assertEqual(resp.status_code, 403)

    def test_parent_cannot_retrieve_a_students_record_directly(self):
        parent = make_user(role=Role.PARENT)
        client = APIClient()
        client.force_authenticate(user=parent)
        resp = client.get(f'/api/students/{self.student.public_id}/')
        self.assertEqual(resp.status_code, 403)

    def test_parent_can_use_my_children(self):
        parent = make_user(role=Role.PARENT)
        client = APIClient()
        client.force_authenticate(user=parent)
        resp = client.get('/api/students/my-children/')
        self.assertEqual(resp.status_code, 200)

    def test_teacher_can_list_students(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.get('/api/students/')
        self.assertEqual(resp.status_code, 200)

    def test_teacher_cannot_create_student(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.post('/api/students/', self._create_payload(), format='json')
        self.assertEqual(resp.status_code, 403)

    def test_headteacher_can_create_student(self):
        headteacher = make_user(role=Role.HEADTEACHER)
        client = APIClient()
        client.force_authenticate(user=headteacher)
        resp = client.post('/api/students/', self._create_payload(), format='json')
        self.assertEqual(resp.status_code, 201)

    def test_bursar_cannot_edit_student(self):
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.patch(f'/api/students/{self.student.public_id}/', {
            'first_name': 'Changed',
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_academic_teacher_can_edit_student(self):
        teacher = make_user(role=Role.ACADEMIC_TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.patch(f'/api/students/{self.student.public_id}/', {
            'first_name': 'Changed',
        }, format='json')
        self.assertEqual(resp.status_code, 200)


class GuardianPermissionTests(TestCase):
    def setUp(self):
        self.student = make_student()
        self.guardian = Guardian.objects.create(
            student=self.student, full_name='Parent Name', relationship='FATHER',
            phone='+255712345678',
        )

    def test_bursar_cannot_edit_guardian(self):
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.patch(f'/api/students/guardians/{self.guardian.id}/', {
            'full_name': 'Changed Name',
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_headteacher_can_edit_guardian(self):
        headteacher = make_user(role=Role.HEADTEACHER)
        client = APIClient()
        client.force_authenticate(user=headteacher)
        resp = client.patch(f'/api/students/guardians/{self.guardian.id}/', {
            'full_name': 'Changed Name',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
