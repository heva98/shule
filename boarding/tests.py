from django.test import TransactionTestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_academic_year, make_student, make_user, run_concurrently

from .models import BoardingAssignment, Dormitory


class BoardingCapacityLockingTests(TransactionTestCase):
    """Regression test for the select_for_update() race-condition fix — two
    concurrent requests for the last bed in a dormitory must not both succeed."""

    def test_concurrent_assignment_to_last_bed_only_one_succeeds(self):
        owner = make_user(role=Role.OWNER)
        academic_year = make_academic_year()
        dormitory = Dormitory.objects.create(name='Test Dorm', gender='M', capacity=1)
        student_a = make_student(gender='M')
        student_b = make_student(gender='M')

        def assign(student):
            client = APIClient()
            client.force_authenticate(user=owner)
            resp = client.post('/api/boarding/assignments/', {
                'dormitory': dormitory.id,
                'student': student.id,
                'academic_year': academic_year.id,
            }, format='json')
            return resp.status_code

        codes = run_concurrently(lambda: assign(student_a), lambda: assign(student_b))

        self.assertEqual(sorted(codes), [201, 400])
        self.assertEqual(
            BoardingAssignment.objects.filter(dormitory=dormitory, is_active=True).count(), 1
        )


class BoardingPermissionTests(TransactionTestCase):
    def setUp(self):
        self.academic_year = make_academic_year()
        self.dormitory = Dormitory.objects.create(name='Perm Dorm', gender='F', capacity=5)
        self.student = make_student(gender='F')

    def test_disallowed_role_cannot_create_assignment(self):
        teacher = make_user(role=Role.SUBJECT_TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.post('/api/boarding/assignments/', {
            'dormitory': self.dormitory.id,
            'student': self.student.id,
            'academic_year': self.academic_year.id,
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_warden_can_create_assignment(self):
        warden = make_user(role=Role.WARDEN)
        client = APIClient()
        client.force_authenticate(user=warden)
        resp = client.post('/api/boarding/assignments/', {
            'dormitory': self.dormitory.id,
            'student': self.student.id,
            'academic_year': self.academic_year.id,
        }, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_disallowed_role_cannot_create_dormitory(self):
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.post('/api/boarding/dormitories/', {
            'name': 'New Dorm', 'gender': 'M', 'capacity': 10,
        }, format='json')
        self.assertEqual(resp.status_code, 403)
