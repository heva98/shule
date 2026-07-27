import datetime

from django.test import TransactionTestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_academic_year, make_student, make_user
from students.models import Guardian, Relationship

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


class ReportCardAuthorizationTests(TransactionTestCase):
    """Regression coverage for the report-card IDOR: an authenticated user
    who has no relationship to a student must not be able to view it."""

    def setUp(self):
        self.student = make_student()
        Guardian.objects.create(
            student=self.student,
            full_name='Jane Parent',
            relationship=Relationship.MOTHER,
            phone='+255712345678',
            email='jane.parent@test.local',
            is_primary_contact=True,
        )
        self.url = f'/api/students/{self.student.public_id}/report-card/'

    def test_unrelated_parent_cannot_view_report_card(self):
        stranger = make_user(role=Role.PARENT, phone='+255700000000', email='stranger@test.local')
        client = APIClient()
        client.force_authenticate(user=stranger)
        resp = client.get(self.url)
        self.assertEqual(resp.status_code, 403)

    def test_disallowed_staff_role_cannot_view_report_card(self):
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.get(self.url)
        self.assertEqual(resp.status_code, 403)

    def test_own_parent_can_reach_report_card(self):
        parent = make_user(role=Role.PARENT, phone='+255712345678', email='jane.parent@test.local')
        client = APIClient()
        client.force_authenticate(user=parent)
        # No exam= param supplied — a 400 (not 403) proves the authorization
        # check passed and it's failing on the next validation step instead.
        resp = client.get(self.url)
        self.assertEqual(resp.status_code, 400)

    def test_teacher_can_reach_report_card(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.get(self.url)
        self.assertEqual(resp.status_code, 400)
