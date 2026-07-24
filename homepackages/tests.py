import datetime

from django.test import TransactionTestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_academic_year, make_subject, make_user

from .models import HomePackage


class HomePackagePermissionTests(TransactionTestCase):
    def setUp(self):
        self.academic_year = make_academic_year()
        self.subject = make_subject()

    def _payload(self):
        return {
            'title': 'Holiday Work',
            'subject': self.subject.id,
            'level': 'STD1',
            'stream': '',
            'academic_year': self.academic_year.id,
            'quarter': 'Q1',
            'due_date': str(datetime.date.today() + datetime.timedelta(days=30)),
        }

    def test_disallowed_role_cannot_create(self):
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.post('/api/homepackages/', self._payload(), format='json')
        self.assertEqual(resp.status_code, 403)

    def test_class_teacher_can_create(self):
        teacher = make_user(role=Role.CLASS_TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.post('/api/homepackages/', self._payload(), format='json')
        self.assertEqual(resp.status_code, 201)

    def test_non_owner_non_senior_cannot_edit_others_post(self):
        poster = make_user(role=Role.CLASS_TEACHER)
        other_teacher = make_user(role=Role.SUBJECT_TEACHER)
        pkg = HomePackage.objects.create(
            title='Original', subject=self.subject, level='STD1',
            academic_year=self.academic_year, quarter='Q1',
            due_date=datetime.date.today() + datetime.timedelta(days=30),
            posted_by=poster,
        )
        client = APIClient()
        client.force_authenticate(user=other_teacher)
        resp = client.patch(f'/api/homepackages/{pkg.id}/', {'title': 'Hijacked'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_senior_staff_can_edit_others_post(self):
        poster = make_user(role=Role.CLASS_TEACHER)
        headteacher = make_user(role=Role.HEADTEACHER)
        pkg = HomePackage.objects.create(
            title='Original', subject=self.subject, level='STD1',
            academic_year=self.academic_year, quarter='Q1',
            due_date=datetime.date.today() + datetime.timedelta(days=30),
            posted_by=poster,
        )
        client = APIClient()
        client.force_authenticate(user=headteacher)
        resp = client.patch(f'/api/homepackages/{pkg.id}/', {'title': 'Corrected'}, format='json')
        self.assertEqual(resp.status_code, 200)

    def test_original_poster_can_edit_own_post(self):
        poster = make_user(role=Role.CLASS_TEACHER)
        pkg = HomePackage.objects.create(
            title='Original', subject=self.subject, level='STD1',
            academic_year=self.academic_year, quarter='Q1',
            due_date=datetime.date.today() + datetime.timedelta(days=30),
            posted_by=poster,
        )
        client = APIClient()
        client.force_authenticate(user=poster)
        resp = client.patch(f'/api/homepackages/{pkg.id}/', {'title': 'Updated by author'}, format='json')
        self.assertEqual(resp.status_code, 200)
