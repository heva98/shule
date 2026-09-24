import datetime
from decimal import Decimal
from unittest import mock

from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from accounts.models import Role
from exams.models import Exam, ExamType, MarkEntry
from fees.models import AcademicYear
from shule.factories import make_staff, make_stream, make_student, make_subject, make_user
from staff.models import ClassTeacherAssignment
from students.models import Enrolment, StudentStatus

from .tests_registry import FULL_MODULES, MSEWE_MODULES

URL = '/api/analytics/query/'
TODAY = datetime.date(2026, 9, 24)  # Q3 by the calendar → THIS_TERM = 2026T2


def _client(role=Role.OWNER, user=None):
    client = APIClient()
    client.force_authenticate(user=user or make_user(role=role))
    return client


def _get(client, *dimensions, filters=()):
    params = [('dimension', d) for d in dimensions] + [('filter', f) for f in filters]
    query = '&'.join(f'{k}={v}' for k, v in params)
    return client.get(f'{URL}?{query}')


def _values(resp):
    """{(row items…): value} from a successful response."""
    assert resp.status_code == 200, resp.data
    return {tuple(r[:-2]): r[-2] for r in resp.data['rows']}


class MarksFixture:
    """Two FORM1 pupils and one FORM2 pupil, in both terms of 2026.

    TERM1 (Q1 midterm)
      FORM1  girl  MATH 40, ENG 60, KISW 80     boy  MATH 70
      FORM2  girl  MATH 90
    TERM2 (Q3 midterm)
      FORM1  girl  MATH 50                      boy  MATH 30, ENG 40
    """

    def build(self):
        self.year = AcademicYear.objects.create(year=2026, is_current=True)
        self.teacher = make_user(role=Role.ACADEMIC_TEACHER)
        self.math = make_subject(level_group='OLEVEL', code='MATH', name='Mathematics')
        self.eng = make_subject(level_group='OLEVEL', code='ENG', name='English')
        self.kisw = make_subject(level_group='OLEVEL', code='KISW', name='Kiswahili')
        make_stream('A')
        self.girl1 = make_student(gender='F', level='FORM1', stream='A')
        self.boy1 = make_student(gender='M', level='FORM1', stream='A')
        self.girl2 = make_student(gender='F', level='FORM2', stream='A')

        t1_f1 = self._exam('FORM1', 'TERM1', 'Q1')
        t1_f2 = self._exam('FORM2', 'TERM1', 'Q1')
        t2_f1 = self._exam('FORM1', 'TERM2', 'Q3')
        self._marks(t1_f1, self.girl1, [(self.math, 40), (self.eng, 60), (self.kisw, 80)])
        self._marks(t1_f1, self.boy1, [(self.math, 70)])
        self._marks(t1_f2, self.girl2, [(self.math, 90)])
        self._marks(t2_f1, self.girl1, [(self.math, 50)])
        self._marks(t2_f1, self.boy1, [(self.math, 30), (self.eng, 40)])

    def _exam(self, level, term, quarter):
        return Exam.objects.create(
            name=f'Midterm {level} {quarter}', academic_year=self.year, term=term,
            quarter=quarter, level=level, exam_type=ExamType.MIDTERM,
            start_date=datetime.date(2026, 3, 1), end_date=datetime.date(2026, 3, 5),
            created_by=self.teacher,
        )

    def _marks(self, exam, pupil, marks):
        for subject, score in marks:
            MarkEntry.objects.create(exam=exam, student=pupil, subject=subject,
                                     score=Decimal(score), entered_by=self.teacher)


@override_settings(ENABLED_MODULES=FULL_MODULES)
@mock.patch('analytics.periods.timezone.localdate', return_value=TODAY)
class QueryEndpointTests(MarksFixture, TestCase):
    def setUp(self):
        self.build()
        self.client = _client()

    def test_multi_metric_by_period_and_class(self, _):
        resp = _get(self.client, 'dx:exam.mean_score;exam.marks_count;exam.candidates',
                    'pe:THIS_TERM;LAST_TERM', 'ou:FORM1;FORM2')
        self.assertEqual(_values(resp), {
            # Weighted: (40+60+80+70) / 4 = 62.5, not the pupils' means (60+70)/2 = 65.
            ('exam.mean_score', '2026T1', 'FORM1'): 62.5,
            ('exam.mean_score', '2026T1', 'FORM2'): 90.0,
            ('exam.mean_score', '2026T2', 'FORM1'): 40.0,
            ('exam.marks_count', '2026T1', 'FORM1'): 4,
            ('exam.marks_count', '2026T1', 'FORM2'): 1,
            ('exam.marks_count', '2026T2', 'FORM1'): 3,
            ('exam.candidates', '2026T1', 'FORM1'): 2,
            ('exam.candidates', '2026T1', 'FORM2'): 1,
            ('exam.candidates', '2026T2', 'FORM1'): 2,
        })

    def test_response_shape(self, _):
        data = _get(self.client, 'dx:exam.mean_score', 'pe:LAST_TERM;THIS_TERM',
                    'ou:FORM1').data
        self.assertEqual([h['name'] for h in data['headers']],
                         ['dx', 'pe', 'ou', 'value', 'suppressed'])
        # Relative periods resolved in request order; rows follow the item order.
        self.assertEqual(data['metaData']['dimensions'],
                         {'dx': ['exam.mean_score'], 'pe': ['2026T1', '2026T2'], 'ou': ['FORM1']})
        self.assertEqual(data['rows'], [['exam.mean_score', '2026T1', 'FORM1', 62.5, False],
                                        ['exam.mean_score', '2026T2', 'FORM1', 40.0, False]])
        items = data['metaData']['items']
        self.assertEqual(items['exam.mean_score']['name'], 'Mean score (%)')
        self.assertEqual(items['2026T1'], {'name': 'Term 1 2026'})
        self.assertEqual(items['THIS_TERM'], {'name': 'This term'})
        self.assertEqual(items['FORM1'], {'name': 'Form 1'})
        self.assertEqual(items['pe'], {'name': 'Period'})

    def test_one_aggregated_query_per_fact_source(self, _):
        with CaptureQueriesContext(connection) as ctx:
            resp = _get(self.client, 'dx:exam.mean_score;exam.marks_count;exam.median_score',
                        'pe:THIS_TERM;LAST_TERM', 'ou:FORM1;FORM2', 'gender')
        self.assertEqual(resp.status_code, 200)
        fact_queries = [q for q in ctx.captured_queries
                        if 'FROM "exams_markentry"' in q['sql']]
        self.assertEqual(len(fact_queries), 1)
        self.assertIn('GROUP BY', fact_queries[0]['sql'])

    def test_whole_year_is_weighted_over_both_terms(self, _):
        resp = _get(self.client, 'dx:exam.mean_score', 'pe:2026', 'ou:FORM1')
        # (40+60+80+70+50+30+40) / 7 = 52.857…
        self.assertEqual(_values(resp), {('exam.mean_score', '2026', 'FORM1'): 52.86})

    def test_filters(self, _):
        resp = _get(self.client, 'dx:exam.mean_score;exam.marks_count', 'pe:2026T1',
                    'ou:FORM1;FORM2', filters=['subject:MATH', 'gender:F'])
        self.assertEqual(_values(resp), {
            ('exam.mean_score', '2026T1', 'FORM1'): 40.0,
            ('exam.mean_score', '2026T1', 'FORM2'): 90.0,
            ('exam.marks_count', '2026T1', 'FORM1'): 1,
            ('exam.marks_count', '2026T1', 'FORM2'): 1,
        })
        dims = resp.data['metaData']['dimensions']
        self.assertEqual(dims['subject'], ['MATH'])
        self.assertEqual(dims['gender'], ['F'])
        # Filters don't add columns.
        self.assertEqual([h['name'] for h in resp.data['headers']][:3], ['dx', 'pe', 'ou'])

    def test_period_as_filter_aggregates_across_periods(self, _):
        resp = _get(self.client, 'dx:exam.marks_count', 'subject',
                    filters=['pe:2026T1;2026T2', 'ou:FORM1'])
        self.assertEqual(_values(resp), {
            ('exam.marks_count', 'ENG'): 2,
            ('exam.marks_count', 'KISW'): 1,
            ('exam.marks_count', 'MATH'): 4,
        })

    def test_dimension_without_items_lists_observed_values(self, _):
        resp = _get(self.client, 'dx:exam.marks_count', 'pe:2026T1', 'gender')
        self.assertEqual(_values(resp), {('exam.marks_count', '2026T1', 'F'): 4,
                                         ('exam.marks_count', '2026T1', 'M'): 1})
        self.assertEqual(resp.data['metaData']['dimensions']['gender'], ['F', 'M'])
        self.assertEqual(resp.data['metaData']['items']['F'], {'name': 'Female'})

    def test_overlapping_periods_and_org_units(self, _):
        """A fact in both 2026 and 2026T1, or both OLEVEL and FORM1, counts in each."""
        resp = _get(self.client, 'dx:exam.marks_count', 'pe:2026;2026T1', 'ou:OLEVEL;FORM1')
        self.assertEqual(_values(resp), {
            ('exam.marks_count', '2026', 'OLEVEL'): 8,
            ('exam.marks_count', '2026', 'FORM1'): 7,
            ('exam.marks_count', '2026T1', 'OLEVEL'): 5,
            ('exam.marks_count', '2026T1', 'FORM1'): 4,
        })

    def test_stream_and_school_org_units(self, _):
        resp = _get(self.client, 'dx:exam.marks_count', 'pe:2026T1', 'ou:SCHOOL;FORM1/A')
        self.assertEqual(_values(resp), {('exam.marks_count', '2026T1', 'SCHOOL'): 5,
                                         ('exam.marks_count', '2026T1', 'FORM1/A'): 4})

    def test_empty_result(self, _):
        resp = _get(self.client, 'dx:exam.mean_score;exam.marks_count', 'pe:2025',
                    'ou:FORM1;FORM2')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['rows'], [])
        self.assertEqual(resp.data['height'], 0)
        self.assertEqual(len(resp.data['headers']), 5)
        self.assertEqual(resp.data['metaData']['dimensions']['ou'], ['FORM1', 'FORM2'])

    def test_empty_result_without_grouping(self, _):
        resp = _get(self.client, 'dx:exam.marks_count', filters=['pe:2025'])
        self.assertEqual(resp.data['rows'], [])

    def test_ungrouped_total(self, _):
        resp = _get(self.client, 'dx:exam.marks_count;exam.mean_score', filters=['pe:2026'])
        self.assertEqual(resp.data['rows'], [['exam.marks_count', 8, False],
                                             ['exam.mean_score', 57.5, False]])

    def test_enrolment_is_yearly(self, _):
        for pupil in (self.girl1, self.boy1, self.girl2):
            Enrolment.objects.update_or_create(
                student=pupil, academic_year=self.year,
                defaults={'level': pupil.level, 'stream': 'A', 'status': StudentStatus.ACTIVE,
                          'enrolled_on': datetime.date(2026, 1, 8)})
        resp = _get(self.client, 'dx:enrol.enrolled', 'pe:2026T1;2026T2', 'ou:FORM1')
        self.assertEqual(_values(resp), {('enrol.enrolled', '2026T1', 'FORM1'): 2,
                                         ('enrol.enrolled', '2026T2', 'FORM1'): 2})
        self.assertTrue(any('per academic year' in w
                            for w in resp.data['metaData']['warnings']))

    def test_query_time_is_logged(self, _):
        with self.assertLogs('analytics.query', level='INFO') as logs:
            _get(self.client, 'dx:exam.marks_count', 'pe:2026T1')
        self.assertRegex(logs.output[0], r'sql_queries=1 rows=1 time_ms=\d+\.\d')


@override_settings(ENABLED_MODULES=FULL_MODULES)
class QueryValidationTests(MarksFixture, TestCase):
    def setUp(self):
        self.build()
        self.client = _client()

    def assert400(self, resp, code=None):
        self.assertEqual(resp.status_code, 400, resp.data)
        if code:
            self.assertEqual(resp.data['code'], code)

    def test_unknown_metric(self):
        self.assert400(_get(self.client, 'dx:avg_score', 'pe:2026'), 'unknown_item')

    def test_unknown_dimension(self):
        self.assert400(_get(self.client, 'dx:exam.marks_count', 'pe:2026', 'colour:RED'),
                       'unknown_dimension')

    def test_unknown_items(self):
        for dims, filters in [
            (('pe:NEXT_DECADE',), ()),
            (('pe:2026T3',), ()),
            (('pe:2026', 'ou:CLASS_FORM_1'), ()),
            (('pe:2026', 'ou:FORM1/Z'), ()),
            (('pe:2026',), ('subject:NOPE',)),
            (('pe:2026',), ('gender:X',)),
        ]:
            with self.subTest(dims=dims, filters=filters):
                self.assert400(_get(self.client, 'dx:exam.marks_count', *dims, filters=filters),
                               'unknown_item')

    def test_dx_and_pe_are_required(self):
        self.assert400(_get(self.client, 'pe:2026'))
        self.assert400(_get(self.client, 'dx:exam.marks_count'))
        self.assert400(_get(self.client, 'pe:2026', filters=['dx:exam.marks_count']))
        self.assert400(_get(self.client, 'dx:', 'pe:2026'))

    def test_repeated_dimension(self):
        self.assert400(_get(self.client, 'dx:exam.marks_count', 'pe:2026', 'ou:FORM1',
                            filters=['ou:FORM2']))

    def test_dimension_that_does_not_apply_to_the_metric(self):
        self.assert400(_get(self.client, 'dx:enrol.enrolled', 'pe:2026', filters=['subject:MATH']),
                       'dimension_not_applicable')
        self.assert400(_get(self.client, 'dx:fees.reversals', 'pe:2026', 'ou:FORM1'),
                       'dimension_not_applicable')

    def test_month_periods_for_academic_facts(self):
        self.assert400(_get(self.client, 'dx:exam.marks_count', 'pe:202603'),
                       'dimension_not_applicable')

    def test_filter_only_dimension(self):
        self.assert400(_get(self.client, 'dx:exam.marks_count', 'pe:2026', 'exam:1'))

    @override_settings(ANALYTICS_MAX_CELLS=12)
    def test_result_size_is_capped(self):
        ok = _get(self.client, 'dx:exam.marks_count;exam.mean_score', 'pe:2026T1;2026T2',
                  'ou:FORM1;FORM2;FORM3')
        self.assertEqual(ok.status_code, 200)
        resp = _get(self.client, 'dx:exam.marks_count;exam.mean_score', 'pe:2026T1;2026T2',
                    'ou:FORM1;FORM2;FORM3;FORM4')
        self.assert400(resp, 'too_many_cells')
        self.assertEqual((resp.data['cells'], resp.data['max_cells']), (16, 12))
        self.assertIn('filter', resp.data['detail'])

    @override_settings(ANALYTICS_MAX_CELLS=12)
    def test_cap_counts_every_item_of_an_open_dimension(self):
        # No grade items given: all 5 count, so 2 metrics × 2 periods × 5 grades = 20.
        resp = _get(self.client, 'dx:exam.marks_count;exam.mean_score', 'pe:2026T1;2026T2',
                    'grade')
        self.assert400(resp, 'too_many_cells')


@override_settings(ENABLED_MODULES=MSEWE_MODULES)
class DisabledModuleTests(TestCase):
    """Msewe runs without fees: fee metrics and dimensions don't exist there."""

    def test_fee_metric_is_rejected(self):
        resp = _get(_client(), 'dx:fees.billed', 'pe:2026')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['code'], 'unknown_item')

    def test_fee_metric_among_valid_ones_is_rejected(self):
        resp = _get(_client(), 'dx:exam.marks_count;fees.collected', 'pe:2026')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('fees.collected', resp.data['detail'])

    def test_fee_dimension_is_rejected(self):
        resp = _get(_client(), 'dx:enrol.enrolled', 'pe:2026', filters=['fee_category:TUITION'])
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['code'], 'unknown_dimension')


@override_settings(ENABLED_MODULES=[m for m in FULL_MODULES if m != 'reports'])
class AcademicsOffTests(TestCase):
    def test_score_metric_needs_reports_too(self):
        # D19: academics needs both exams and reports.
        resp = _get(_client(), 'dx:exam.mean_score', 'pe:2026')
        self.assertEqual(resp.status_code, 400)


@override_settings(ENABLED_MODULES=[m for m in FULL_MODULES if m != 'analytics'])
class AnalyticsOffTests(TestCase):
    def test_forbidden(self):
        self.assertEqual(_get(_client(), 'dx:enrol.enrolled', 'pe:2026').status_code, 403)


@override_settings(ENABLED_MODULES=FULL_MODULES)
class QueryAccessTests(MarksFixture, TestCase):
    def setUp(self):
        self.build()

    def test_requires_authentication(self):
        self.assertEqual(APIClient().get(f'{URL}?dimension=dx:enrol.enrolled').status_code, 401)

    def test_non_analytics_roles_are_forbidden(self):
        for role in (Role.PARENT, Role.STUDENT, Role.TEACHER):
            with self.subTest(role=role):
                resp = _get(_client(role), 'dx:enrol.enrolled', 'pe:2026')
                self.assertEqual(resp.status_code, 403)

    def test_metric_outside_role_group_is_forbidden(self):
        resp = _get(_client(Role.BURSAR), 'dx:exam.mean_score', 'pe:2026')
        self.assertEqual(resp.status_code, 403)

    def test_academic_dimension_hidden_from_bursar(self):
        resp = _get(_client(Role.BURSAR), 'dx:fees.billed', 'pe:2026', 'subject')
        self.assertEqual(resp.status_code, 400)

    def test_small_score_cells_are_masked(self):
        """D18: under 5 pupils, an academic teacher gets no score; counts stay."""
        resp = _get(_client(Role.ACADEMIC_TEACHER),
                    'dx:exam.mean_score;exam.marks_count', 'pe:2026T1', 'ou:FORM1')
        self.assertEqual(resp.data['rows'], [
            ['exam.mean_score', '2026T1', 'FORM1', None, True],
            ['exam.marks_count', '2026T1', 'FORM1', 4, False],
        ])

    @override_settings(ANALYTICS_MIN_CELL_SIZE=2)
    def test_mask_threshold_is_a_setting(self):
        resp = _get(_client(Role.ACADEMIC_TEACHER), 'dx:exam.mean_score', 'pe:2026T1',
                    'ou:FORM1;FORM2')
        self.assertEqual(_values(resp), {('exam.mean_score', '2026T1', 'FORM1'): 62.5,
                                         ('exam.mean_score', '2026T1', 'FORM2'): None})

    def test_headteacher_sees_small_cells(self):
        resp = _get(_client(Role.HEADTEACHER), 'dx:exam.mean_score', 'pe:2026T1', 'ou:FORM2')
        self.assertEqual(_values(resp), {('exam.mean_score', '2026T1', 'FORM2'): 90.0})

    def test_class_teacher_sees_only_their_class(self):
        staff = make_staff(role=Role.CLASS_TEACHER)
        ClassTeacherAssignment.objects.create(
            teacher=staff, level='FORM1', stream='A', academic_year=self.year,
            assigned_by=make_user(),
        )
        client = _client(user=staff.user)
        resp = _get(client, 'dx:exam.marks_count', 'pe:2026T1', 'ou:FORM1;FORM2')
        self.assertEqual(_values(resp), {('exam.marks_count', '2026T1', 'FORM1'): 4})
        resp = _get(client, 'dx:exam.marks_count', filters=['pe:2026T1'])
        self.assertEqual(resp.data['rows'], [['exam.marks_count', 4, False]])

    def test_class_teacher_without_assignment_sees_nothing(self):
        staff = make_staff(role=Role.CLASS_TEACHER)
        resp = _get(_client(user=staff.user), 'dx:exam.marks_count', filters=['pe:2026'])
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['rows'], [])

    def test_class_teacher_cannot_query_school_level_metrics(self):
        staff = make_staff(role=Role.CLASS_TEACHER)
        resp = _get(_client(user=staff.user), 'dx:enrol.new_admissions', 'pe:2026')
        self.assertEqual(resp.status_code, 403)
