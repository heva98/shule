import datetime
from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import AuditLog, Role
from shule.factories import make_staff, make_user
from staff.models import ClassTeacherAssignment
from students.models import Enrolment, StudentStatus

from .tests_query import TODAY, MarksFixture
from .tests_registry import FULL_MODULES

URL = '/api/analytics/drilldown/'


def _client(role=Role.OWNER, user=None):
    client = APIClient()
    client.force_authenticate(user=user or make_user(role=role))
    return client


def _get(client, *dimensions, filters=()):
    params = [('dimension', d) for d in dimensions] + [('filter', f) for f in filters]
    return client.get(f"{URL}?{'&'.join(f'{k}={v}' for k, v in params)}")


def _pupils(resp):
    """[(name, value)] in response order."""
    assert resp.status_code == 200, resp.data
    return [(p['name'], p['value']) for p in resp.data['pupils']]


@override_settings(ENABLED_MODULES=FULL_MODULES)
@mock.patch('analytics.periods.timezone.localdate', return_value=TODAY)
class DrilldownTests(MarksFixture, TestCase):
    def setUp(self):
        self.build()
        self.client = _client()

    def test_lists_pupils_with_their_own_weighted_value(self, _):
        resp = _get(self.client, 'dx:exam.mean_score', filters=['pe:2026T1', 'ou:FORM1'])
        # The girl's mean is (40+60+80)/3 = 60 over her three marks.
        self.assertEqual(_pupils(resp), [
            (self.boy1.full_name, 70.0), (self.girl1.full_name, 60.0),
        ])
        self.assertEqual(resp.data['total'], 2)
        self.assertFalse(resp.data['truncated'])
        self.assertEqual(resp.data['metric'],
                         {'id': 'exam.mean_score', 'name': 'Mean score (%)', 'unit': 'score'})

    def test_every_filter_narrows_the_cell(self, _):
        resp = _get(self.client, 'dx:exam.marks_count',
                    filters=['pe:2026T1', 'ou:FORM1', 'gender:F', 'subject:MATH;ENG'])
        self.assertEqual(_pupils(resp), [(self.girl1.full_name, 2)])

    def test_pupil_payload_has_no_database_ids(self, _):
        resp = _get(self.client, 'dx:exam.marks_count', filters=['pe:2026T1', 'ou:FORM2'])
        pupil = resp.data['pupils'][0]
        self.assertEqual(set(pupil), {'public_id', 'name', 'admission_no', 'gender',
                                      'level', 'stream', 'value'})
        self.assertEqual(pupil['public_id'], str(self.girl2.public_id))

    def test_needs_exactly_one_metric_and_no_breakdown(self, _):
        resp = _get(self.client, 'dx:exam.mean_score;exam.marks_count', filters=['pe:2026T1'])
        self.assertEqual(resp.status_code, 400)
        resp = _get(self.client, 'dx:exam.mean_score', 'ou:FORM1', filters=['pe:2026T1'])
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['code'], 'not_a_cell')

    def test_query_validation_still_applies(self, _):
        self.assertEqual(_get(self.client, 'dx:nope', filters=['pe:2026']).status_code, 400)
        self.assertEqual(_get(self.client, 'dx:exam.mean_score').status_code, 400)

    def test_rows_are_capped(self, _):
        with self.settings(ANALYTICS_DRILLDOWN_MAX_ROWS=1):
            resp = _get(self.client, 'dx:exam.marks_count', filters=['pe:2026T1'])
        self.assertEqual(len(resp.data['pupils']), 1)
        self.assertEqual(resp.data['total'], 3)
        self.assertTrue(resp.data['truncated'])

    def test_each_call_is_audited(self, _):
        _get(self.client, 'dx:exam.marks_count', filters=['pe:2026T1', 'ou:FORM1'])
        log = AuditLog.objects.get(action=AuditLog.Action.ANALYTICS_DRILLDOWN)
        self.assertIn('2 pupils', log.description)
        self.assertEqual(log.extra_data, {'dimension': ['dx:exam.marks_count'],
                                          'filter': ['pe:2026T1', 'ou:FORM1']})


@override_settings(ENABLED_MODULES=FULL_MODULES)
@mock.patch('analytics.periods.timezone.localdate', return_value=TODAY)
class DrilldownAccessTests(MarksFixture, TestCase):
    def setUp(self):
        self.build()

    def test_non_analytics_roles_are_forbidden(self, _):
        for role in (Role.PARENT, Role.STUDENT, Role.TEACHER, Role.SUBJECT_TEACHER):
            with self.subTest(role=role):
                resp = _get(_client(role), 'dx:exam.marks_count', filters=['pe:2026'])
                self.assertEqual(resp.status_code, 403)

    def test_masked_roles_cannot_list_pupils_for_score_metrics(self, _):
        client = _client(Role.ACADEMIC_TEACHER)
        resp = _get(client, 'dx:exam.mean_score', filters=['pe:2026T1'])
        self.assertEqual(resp.status_code, 403)
        # Counts aren't masked, so the same role may list pupils for them.
        resp = _get(client, 'dx:exam.marks_count', filters=['pe:2026T1'])
        self.assertEqual(resp.status_code, 200)

    def test_metric_outside_role_group_is_forbidden(self, _):
        resp = _get(_client(Role.BURSAR), 'dx:exam.marks_count', filters=['pe:2026'])
        self.assertEqual(resp.status_code, 403)

    def test_bursar_can_list_enrolled_pupils(self, _):
        for pupil in (self.girl1, self.boy1):
            Enrolment.objects.update_or_create(
                student=pupil, academic_year=self.year,
                defaults={'level': 'FORM1', 'stream': 'A', 'status': StudentStatus.ACTIVE,
                          'enrolled_on': datetime.date(2026, 1, 8)})
        resp = _get(_client(Role.BURSAR), 'dx:enrol.enrolled', filters=['pe:2026', 'ou:FORM1'])
        self.assertEqual(sorted(n for n, _ in _pupils(resp)),
                         sorted([self.girl1.full_name, self.boy1.full_name]))

    def test_class_teacher_sees_only_their_own_class(self, _):
        staff = make_staff(role=Role.CLASS_TEACHER)
        ClassTeacherAssignment.objects.create(
            teacher=staff, level='FORM1', stream='A', academic_year=self.year,
            assigned_by=make_user(),
        )
        client = _client(user=staff.user)
        # Score metrics are fine: a class teacher sees their class unmasked.
        resp = _get(client, 'dx:exam.mean_score', filters=['pe:2026T1', 'ou:FORM1'])
        self.assertEqual(len(_pupils(resp)), 2)
        # Another class, or the whole school, lists only their own pupils.
        resp = _get(client, 'dx:exam.mean_score', filters=['pe:2026T1', 'ou:FORM2'])
        self.assertEqual(_pupils(resp), [])
        resp = _get(client, 'dx:exam.marks_count', filters=['pe:2026T1'])
        self.assertEqual({n for n, _ in _pupils(resp)},
                         {self.girl1.full_name, self.boy1.full_name})

    def test_class_teacher_without_assignment_sees_nobody(self, _):
        staff = make_staff(role=Role.CLASS_TEACHER)
        resp = _get(_client(user=staff.user), 'dx:exam.marks_count', filters=['pe:2026'])
        self.assertEqual(_pupils(resp), [])

    def test_catalogue_flags_which_metrics_can_be_drilled(self, _):
        def flags(role):
            data = _client(role).get('/api/analytics/dimensions/').data
            dx = next(d for d in data['dimensions'] if d['id'] == 'dx')
            return {m['id']: m['drilldown'] for m in dx['items']}

        self.assertTrue(flags(Role.HEADTEACHER)['exam.mean_score'])
        academic = flags(Role.ACADEMIC_TEACHER)
        self.assertFalse(academic['exam.mean_score'])
        self.assertTrue(academic['exam.marks_count'])


@override_settings(ENABLED_MODULES=[m for m in FULL_MODULES if m != 'analytics'])
class DrilldownModuleOffTests(TestCase):
    def test_forbidden_when_module_disabled(self):
        resp = _get(_client(), 'dx:enrol.enrolled', filters=['pe:2026'])
        self.assertEqual(resp.status_code, 403)
