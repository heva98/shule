import datetime

from django.test import TransactionTestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_academic_year, make_staff, make_student, make_subject, make_user
from students.models import Guardian, Relationship

from .models import Exam, ExamType, MarkEntry


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


class SubjectPermissionTests(TransactionTestCase):
    def _payload(self):
        return {
            'name': 'Mathematics', 'code': 'MATH',
            'level_group': 'PRIMARY', 'is_compulsory': True,
        }

    def test_disallowed_role_cannot_create_subject(self):
        parent = make_user(role=Role.PARENT)
        client = APIClient()
        client.force_authenticate(user=parent)
        resp = client.post('/api/exams/subjects/', self._payload(), format='json')
        self.assertEqual(resp.status_code, 403)

    def test_disallowed_role_cannot_delete_subject(self):
        subject = make_subject()
        librarian = make_user(role=Role.LIBRARIAN)
        client = APIClient()
        client.force_authenticate(user=librarian)
        resp = client.delete(f'/api/exams/subjects/{subject.id}/')
        self.assertEqual(resp.status_code, 403)

    def test_senior_staff_can_create_subject(self):
        headteacher = make_user(role=Role.HEADTEACHER)
        client = APIClient()
        client.force_authenticate(user=headteacher)
        resp = client.post('/api/exams/subjects/', self._payload(), format='json')
        self.assertEqual(resp.status_code, 201)

    def test_any_authenticated_role_can_list_subjects(self):
        make_subject()
        student = make_user(role=Role.STUDENT)
        client = APIClient()
        client.force_authenticate(user=student)
        resp = client.get('/api/exams/subjects/')
        self.assertEqual(resp.status_code, 200)


class SchoolPerformanceTests(TransactionTestCase):
    """
    Dashboard snapshot for Owner/Headteacher/Academic Teacher — ranks
    classes and subjects by average score for the most recent exam with
    marks. The ranking math is exactly the kind of thing that breaks
    silently on a refactor, so it's worth pinning down with real numbers.
    """

    def setUp(self):
        self.academic_year = make_academic_year()
        self.owner = make_user(role=Role.OWNER)
        self.math = make_subject(level_group='PRIMARY', name='Basic Mathematics', code='MATHS')
        self.eng = make_subject(level_group='PRIMARY', name='English', code='ENG')

        self.exam = Exam.objects.create(
            name='Combined Exam', academic_year=self.academic_year, term='TERM1', quarter='Q1',
            level='STD3', stream='', exam_type=ExamType.WEEKLY,
            start_date=datetime.date.today(), end_date=datetime.date.today(),
            created_by=self.owner,
        )

        # Stream A: Maths avg 90, English avg 70 (avg for the class: 80).
        # Stream B: English avg 50 only (avg for the class: 50).
        # English deliberately appears in both classes at different levels
        # of performance — the per-class scoping should keep them as two
        # separate ranked rows rather than blending into one "English" average.
        for score in [90, 90, 90]:
            student = make_student(level='STD3', stream='A')
            MarkEntry.objects.create(exam=self.exam, student=student, subject=self.math, score=score, entered_by=self.owner)
        for score in [70, 70, 70]:
            student = make_student(level='STD3', stream='A')
            MarkEntry.objects.create(exam=self.exam, student=student, subject=self.eng, score=score, entered_by=self.owner)
        for score in [50, 50, 50]:
            student = make_student(level='STD3', stream='B')
            MarkEntry.objects.create(exam=self.exam, student=student, subject=self.eng, score=score, entered_by=self.owner)

    def test_ranks_classes_and_subjects_by_average(self):
        client = APIClient()
        client.force_authenticate(user=self.owner)
        resp = client.get('/api/exams/school-performance/')
        self.assertEqual(resp.status_code, 200)

        self.assertEqual(resp.data['exam']['id'], self.exam.id)
        self.assertEqual(resp.data['top_classes'][0]['stream'], 'A')
        self.assertEqual(resp.data['top_classes'][0]['average'], '80.00')
        self.assertEqual(resp.data['bottom_classes'][0]['stream'], 'B')
        self.assertEqual(resp.data['bottom_classes'][0]['average'], '50.00')

        self.assertEqual(resp.data['top_subjects'][0]['code'], 'MATHS')
        self.assertEqual(resp.data['top_subjects'][0]['stream'], 'A')
        self.assertEqual(resp.data['bottom_subjects'][0]['code'], 'ENG')
        self.assertEqual(resp.data['bottom_subjects'][0]['stream'], 'B')

        # English must appear twice — once per class — never blended into
        # a single school-wide "English" average.
        eng_entries = [
            s for s in resp.data['top_subjects'] + resp.data['bottom_subjects']
            if s['code'] == 'ENG'
        ]
        self.assertEqual({e['stream'] for e in eng_entries}, {'A', 'B'})
        eng_a = next(e for e in eng_entries if e['stream'] == 'A')
        eng_b = next(e for e in eng_entries if e['stream'] == 'B')
        self.assertEqual(eng_a['average'], '70.00')
        self.assertEqual(eng_b['average'], '50.00')

    def test_forbidden_for_roles_outside_owner_headteacher_academic(self):
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.get('/api/exams/school-performance/')
        self.assertEqual(resp.status_code, 403)

    def test_empty_when_no_exam_has_marks(self):
        MarkEntry.objects.all().delete()
        client = APIClient()
        client.force_authenticate(user=self.owner)
        resp = client.get('/api/exams/school-performance/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['exam'])
        self.assertEqual(resp.data['top_classes'], [])


class MySubjectPerformanceTests(TransactionTestCase):
    """Dashboard snapshot for a teacher: top/bottom students in one of
    their assigned subjects, for the most recent exam with marks in it."""

    def setUp(self):
        self.academic_year = make_academic_year()
        owner = make_user(role=Role.OWNER)
        self.subject_teacher = make_staff(role=Role.SUBJECT_TEACHER)
        self.math = make_subject(level_group='PRIMARY', name='Basic Mathematics', code='MATHS')
        self.subject_teacher.subjects.add(self.math)

        self.exam = Exam.objects.create(
            name='Weekly Test', academic_year=self.academic_year, term='TERM1', quarter='Q1',
            level='STD1', stream='', exam_type=ExamType.WEEKLY,
            start_date=datetime.date.today(), end_date=datetime.date.today(),
            created_by=owner,
        )
        for score in [95, 40]:
            student = make_student(level='STD1')
            MarkEntry.objects.create(exam=self.exam, student=student, subject=self.math, score=score, entered_by=owner)

    def test_returns_top_and_bottom_students_for_assigned_subject(self):
        client = APIClient()
        client.force_authenticate(user=self.subject_teacher.user)
        resp = client.get('/api/exams/subject-performance/mine/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['subject']['code'], 'MATHS')
        self.assertEqual(resp.data['top_students'][0]['score'], '95.00')
        self.assertEqual(resp.data['bottom_students'][0]['score'], '40.00')

    def test_rejects_a_subject_not_assigned_to_this_teacher(self):
        other_subject = make_subject(level_group='PRIMARY', name='Science', code='SCI')
        client = APIClient()
        client.force_authenticate(user=self.subject_teacher.user)
        resp = client.get(f'/api/exams/subject-performance/mine/?subject_id={other_subject.id}')
        self.assertEqual(resp.status_code, 403)

    def test_empty_for_a_teacher_with_no_assigned_subjects(self):
        bare_teacher = make_staff(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=bare_teacher.user)
        resp = client.get('/api/exams/subject-performance/mine/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['subjects'], [])
        self.assertIsNone(resp.data['subject'])
