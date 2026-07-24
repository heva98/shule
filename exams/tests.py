import datetime

from django.test import TransactionTestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_academic_year, make_user

from .models import Exam, ExamType


class ExamPermissionTests(TransactionTestCase):
    def setUp(self):
        self.academic_year = make_academic_year()

    def _payload(self):
        return {
            'name': 'Mid Term Exam',
            'academic_year': self.academic_year.id,
            'term': 'TERM1',
            'quarter': 'Q1',
            'level': 'STD1',
            'stream': '',
            'exam_type': ExamType.MIDTERM,
            'start_date': str(datetime.date.today()),
            'end_date': str(datetime.date.today() + datetime.timedelta(days=2)),
        }

    def test_disallowed_role_cannot_create_exam(self):
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.post('/api/exams/', self._payload(), format='json')
        self.assertEqual(resp.status_code, 403)

    def test_teacher_can_create_exam(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.post('/api/exams/', self._payload(), format='json')
        self.assertEqual(resp.status_code, 201)

    def test_teacher_cannot_delete_exam(self):
        creator = make_user(role=Role.TEACHER)
        exam = Exam.objects.create(
            name='Exam', academic_year=self.academic_year, term='TERM1', quarter='Q1',
            level='STD1', exam_type=ExamType.MIDTERM,
            start_date=datetime.date.today(), end_date=datetime.date.today(),
            created_by=creator,
        )
        other_teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=other_teacher)
        resp = client.delete(f'/api/exams/{exam.id}/')
        self.assertEqual(resp.status_code, 403)

    def test_senior_staff_can_delete_exam(self):
        creator = make_user(role=Role.TEACHER)
        exam = Exam.objects.create(
            name='Exam', academic_year=self.academic_year, term='TERM1', quarter='Q1',
            level='STD1', exam_type=ExamType.MIDTERM,
            start_date=datetime.date.today(), end_date=datetime.date.today(),
            created_by=creator,
        )
        headteacher = make_user(role=Role.HEADTEACHER)
        client = APIClient()
        client.force_authenticate(user=headteacher)
        resp = client.delete(f'/api/exams/{exam.id}/')
        self.assertEqual(resp.status_code, 204)
