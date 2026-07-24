from django.test import TransactionTestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_academic_year, make_student, make_user, run_concurrently

from .models import Route, TransportAssignment


class TransportCapacityLockingTests(TransactionTestCase):
    """Regression test for the select_for_update() race-condition fix — two
    concurrent requests for the last seat on a route must not both succeed."""

    def test_concurrent_assignment_to_last_seat_only_one_succeeds(self):
        owner = make_user(role=Role.OWNER)
        academic_year = make_academic_year()
        route = Route.objects.create(name='Test Route', capacity=1)
        student_a = make_student()
        student_b = make_student()

        def assign(student):
            client = APIClient()
            client.force_authenticate(user=owner)
            resp = client.post('/api/transport/assignments/', {
                'route': route.id,
                'student': student.id,
                'academic_year': academic_year.id,
            }, format='json')
            return resp.status_code

        codes = run_concurrently(lambda: assign(student_a), lambda: assign(student_b))

        self.assertEqual(sorted(codes), [201, 400])
        self.assertEqual(
            TransportAssignment.objects.filter(route=route, is_active=True).count(), 1
        )


class TransportPermissionTests(TransactionTestCase):
    def setUp(self):
        self.academic_year = make_academic_year()
        self.route = Route.objects.create(name='Perm Route', capacity=5)
        self.student = make_student()

    def test_disallowed_role_cannot_create_assignment(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.post('/api/transport/assignments/', {
            'route': self.route.id,
            'student': self.student.id,
            'academic_year': self.academic_year.id,
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_bursar_can_create_assignment(self):
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.post('/api/transport/assignments/', {
            'route': self.route.id,
            'student': self.student.id,
            'academic_year': self.academic_year.id,
        }, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_disallowed_role_cannot_create_route(self):
        warden = make_user(role=Role.WARDEN)
        client = APIClient()
        client.force_authenticate(user=warden)
        resp = client.post('/api/transport/routes/', {
            'name': 'New Route', 'capacity': 20,
        }, format='json')
        self.assertEqual(resp.status_code, 403)
