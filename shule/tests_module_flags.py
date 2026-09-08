"""
Permanent regression coverage for the ENABLED_MODULES feature-flag system
(shule/settings.py, accounts/permissions.py's ModuleEnabled).

The failure mode this guards against: a view gains a `module` attribute
naming a module that's actually disabled, but its permission_classes was
never updated to include ModuleEnabled — so the endpoint stays reachable
when it shouldn't be. That's silent and easy to miss in review, since the
view still works correctly for every deployment that has the module on.

New optional-module viewsets/views MUST be added to the relevant list below
(and given `module` + ModuleEnabled) or this suite won't know to check them.
"""
import datetime

from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import Role
from exams.models import Exam, ExamType
from shule.factories import make_academic_year, make_staff, make_student, make_subject, make_user

MSEWE_MODULES = ['exams', 'reports', 'communications']

# Every endpoint gated by an optional module, keyed by the module that must
# be disabled for it to 403. Extend this when a new optional-module view is
# added — it's the whole point of this file.
GATED_ENDPOINTS = [
    ('/api/fees/config/tuition/', 'fees'),
    ('/api/fees/invoices/', 'fees'),
    ('/api/fees/payments/', 'fees'),
    ('/api/fees/defaulters/', 'fees'),
    ('/api/attendance/', 'attendance'),
    ('/api/timetable/periods/', 'timetable'),
    ('/api/boarding/dormitories/', 'boarding'),
    ('/api/transport/routes/', 'transport'),
    ('/api/library/books/', 'library'),
    ('/api/homepackages/', 'homepackages'),
    ('/api/documents/', 'documents'),
    ('/api/admin/school-calendar/', 'school_calendar'),
]

# Endpoints that must stay reachable regardless of ENABLED_MODULES (core,
# never gated by design) or because they belong to a module Msewe enables.
CORE_AND_MSEWE_ENDPOINTS = [
    '/api/students/',
    '/api/staff/',
    '/api/fees/academic-years/',   # core carve-out — Exam FKs to AcademicYear
    '/api/exams/',
    '/api/exams/subjects/',
    '/api/communications/history/',
]


class ModuleFlagDefaultTests(TransactionTestCase):
    """With ENABLED_MODULES unset, behaviour must be unchanged: every
    optional-module endpoint stays reachable, exactly like before the flag
    system existed."""

    def setUp(self):
        make_academic_year()
        self.owner = make_user(role=Role.OWNER)
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def test_default_reaches_every_optional_module_endpoint(self):
        for url, _module in GATED_ENDPOINTS:
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, 200, f'{url} -> {resp.status_code}, expected 200')

    def test_default_reaches_exams_and_reports_and_config(self):
        for url in CORE_AND_MSEWE_ENDPOINTS + ['/api/config/']:
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, 200, f'{url} -> {resp.status_code}, expected 200')


@override_settings(ENABLED_MODULES=MSEWE_MODULES)
class ModuleFlagMseweTests(TransactionTestCase):
    """A representative reduced deployment: only exams/reports/communications
    on — the configuration the Msewe pilot actually runs."""

    def setUp(self):
        self.year = make_academic_year()
        self.owner = make_user(role=Role.OWNER)
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def test_config_endpoint_reports_enabled_modules(self):
        resp = self.client.get('/api/config/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['enabled_modules'], MSEWE_MODULES)

    def test_disabled_modules_403(self):
        for url, module in GATED_ENDPOINTS:
            resp = self.client.get(url)
            self.assertEqual(
                resp.status_code, 403,
                f'{url} (module={module!r}) -> {resp.status_code}, expected 403 — '
                f'is ModuleEnabled missing from this view\'s permission_classes?'
            )

    def test_core_and_enabled_modules_still_reachable(self):
        for url in CORE_AND_MSEWE_ENDPOINTS:
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, 200, f'{url} -> {resp.status_code}, expected 200')

    def test_communications_fee_and_absence_subviews_403(self):
        # communications is ON, but fees/attendance are OFF — the fee-reminder
        # and absence-alert sub-views inside communications must still 403,
        # since they're gated by 'fees'/'attendance', not 'communications'.
        resp = self.client.post('/api/communications/bulk-fee-reminders/')
        self.assertEqual(resp.status_code, 403)
        resp = self.client.post('/api/communications/send-absence-alerts/')
        self.assertEqual(resp.status_code, 403)

    def test_exams_and_reports_end_to_end(self):
        subject = make_subject(level_group='PRIMARY', name='Mathematics', code='MATH')
        make_staff(role=Role.TEACHER)
        student = make_student(level='STD1')

        payload = {
            'name': 'Term 1 Exam', 'academic_year': self.year.id, 'term': 'TERM1',
            'quarter': 'Q1', 'level': 'STD1', 'stream': '', 'exam_type': ExamType.MIDTERM,
            'start_date': str(datetime.date.today()),
            'end_date': str(datetime.date.today() + datetime.timedelta(days=1)),
        }
        resp = self.client.post('/api/exams/', payload, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        exam_id = resp.data['id']

        resp = self.client.post(
            f'/api/exams/{exam_id}/marks/bulk/',
            {'records': [{'student_id': student.student_id, 'subject_id': subject.id, 'score': '78.5'}]},
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)

        resp = self.client.get(f'/api/students/{student.public_id}/report-card/?exam={exam_id}')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['subjects'][0]['score'], '78.50')
        self.assertEqual(resp.data['summary']['subjects_sat'], 1)

        resp = self.client.get(f'/api/exams/class-performance/?exam_id={exam_id}&level=STD1')
        self.assertEqual(resp.status_code, 200, resp.data)

        resp = self.client.get(
            f'/api/exams/subject-performance/?exam_id={exam_id}&subject_id={subject.id}&level=STD1'
        )
        self.assertEqual(resp.status_code, 200, resp.data)


class CeleryTaskGuardTests(TransactionTestCase):
    @override_settings(ENABLED_MODULES=MSEWE_MODULES)
    def test_fee_reminder_task_skips_when_fees_disabled(self):
        from communications.tasks import send_fee_reminders_for_overdue
        result = send_fee_reminders_for_overdue()
        self.assertEqual(result.get('skipped'), 'fees module disabled', result)

    @override_settings(ENABLED_MODULES=MSEWE_MODULES)
    def test_absence_alert_task_skips_when_attendance_disabled(self):
        from communications.tasks import send_daily_absence_alerts
        result = send_daily_absence_alerts.run()
        self.assertEqual(result.get('skipped'), 'attendance module disabled', result)
