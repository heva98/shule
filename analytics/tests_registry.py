import datetime
from decimal import Decimal

from django.test import TestCase, override_settings

from accounts.models import Role
from exams.models import Exam, ExamType, MarkEntry
from fees.models import AcademicYear
from shule.factories import make_student, make_subject, make_user
from students.models import Enrolment, StudentStatus

from .engine import evaluate
from .registry import (
    DIMENSIONS, METRICS, SOURCES, DimensionKind, catalogue, visible_dimensions,
    visible_metrics, visible_sources,
)

FULL_MODULES = [
    'exams', 'reports', 'fees', 'attendance', 'timetable', 'staff', 'boarding',
    'transport', 'library', 'homepackages', 'communications', 'sms', 'documents',
    'school_calendar', 'analytics',
]
# Msewe runs without fees (ANALYTICS_PLAN.md §6.5).
MSEWE_MODULES = ['exams', 'reports', 'communications', 'analytics']

FEE_DIMENSIONS = {'fee_category', 'invoice_kind', 'line_status', 'payment_method', 'adjustment_kind'}


def _ids(items):
    return {i.id for i in items}


class RegistryIntegrityTests(TestCase):
    def test_every_metric_points_at_a_known_source(self):
        for metric in METRICS.values():
            with self.subTest(metric=metric.id):
                self.assertIn(metric.source, SOURCES)

    def test_every_dimension_maps_only_known_sources(self):
        for dim in DIMENSIONS.values():
            for source in dim.group_by:
                self.assertIn(source, SOURCES, f'{dim.id} → {source}')
            for level in dim.levels:
                for source in level.group_by:
                    self.assertIn(source, SOURCES, f'{dim.id}.{level.id} → {source}')

    def test_ratio_and_weighted_metrics_have_a_denominator(self):
        for metric in METRICS.values():
            if metric.aggregation in ('ratio', 'weighted_avg'):
                self.assertIsNotNone(metric.denominator, metric.id)

    def test_every_metric_and_group_by_compiles_and_runs(self):
        """Each metric, grouped by every dimension (and org-unit level) that
        applies to its source, is valid SQL. Runs against an empty database,
        so this checks paths and expressions, not numbers."""
        make_academic_year_2026()
        for metric in METRICS.values():
            with self.subTest(metric=metric.id, group='none'):
                evaluate(metric)
            for dim in DIMENSIONS.values():
                if metric.source not in dim.group_by:
                    continue
                refs = (
                    [(lv.id, dim.field_for(metric.source, lv.id))
                     for lv in dim.levels if metric.source in lv.group_by]
                    if dim.levels else [(None, dim.field_for(metric.source))]
                )
                for level, ref in refs:
                    with self.subTest(metric=metric.id, dim=dim.id, level=level):
                        self.assertEqual(evaluate(metric, group_by=[ref]), [])


def make_academic_year_2026():
    return AcademicYear.objects.create(year=2026, is_current=True)


@override_settings(ENABLED_MODULES=FULL_MODULES)
class ModuleFilteringFullTests(TestCase):
    def test_all_groups_and_fee_metrics_visible(self):
        metric_ids = _ids(visible_metrics())
        self.assertIn('fees.collected', metric_ids)
        self.assertIn('exam.mean_score', metric_ids)
        self.assertIn('sms.messages', metric_ids)
        self.assertIn('enrol.enrolled', metric_ids)
        dims = {d.id for d, _ in visible_dimensions()}
        self.assertTrue(FEE_DIMENSIONS <= dims)


@override_settings(ENABLED_MODULES=MSEWE_MODULES)
class ModuleFilteringMseweTests(TestCase):
    def test_fee_and_sms_metrics_disappear(self):
        metric_ids = _ids(visible_metrics())
        self.assertFalse([m for m in metric_ids if m.startswith(('fees.', 'sms.'))])
        self.assertIn('exam.mean_score', metric_ids)
        self.assertIn('enrol.enrolled', metric_ids)

    def test_fee_sources_and_dimensions_disappear(self):
        source_ids = _ids(visible_sources())
        self.assertFalse([s for s in source_ids if s.startswith('fee_')])
        self.assertNotIn('sms', source_ids)
        dims = {d.id: applies for d, applies in visible_dimensions()}
        self.assertFalse(FEE_DIMENSIONS & set(dims))
        self.assertNotIn('sms_status', dims)
        # Shared dimensions stay, but no longer apply to fee sources.
        self.assertFalse([s for s in dims['gender'] if s.startswith('fee_')])
        self.assertFalse([s for s in dims['ou'] if s.startswith('fee_')])

    def test_catalogue_has_no_trace_of_fees(self):
        cat = catalogue(Role.OWNER)
        self.assertNotIn('fees', {g['id'] for g in cat['groups']})
        dx = next(d for d in cat['dimensions'] if d['id'] == 'dx')
        self.assertFalse([m for m in dx['items'] if m['group'] == 'fees'])
        ou = next(d for d in cat['dimensions'] if d['id'] == 'ou')
        for level in ou['levels']:
            self.assertFalse([s for s in level['applies_to'] if s.startswith('fee_')])


@override_settings(ENABLED_MODULES=['exams', 'fees', 'analytics'])
class AcademicsNeedsExamsAndReportsTests(TestCase):
    def test_academics_hidden_without_reports(self):
        metric_ids = _ids(visible_metrics())
        self.assertFalse([m for m in metric_ids if m.startswith('exam.')])
        dims = {d.id for d, _ in visible_dimensions()}
        self.assertNotIn('subject', dims)
        self.assertNotIn('exam_type', dims)


@override_settings(ENABLED_MODULES=FULL_MODULES)
class RoleFilteringTests(TestCase):
    def test_bursar_sees_fees_and_enrolment_only(self):
        groups = {m.group for m in visible_metrics(Role.BURSAR)}
        self.assertEqual(groups, {'enrolment', 'fees'})
        dims = {d.id for d, _ in visible_dimensions(Role.BURSAR)}
        self.assertNotIn('subject', dims)
        self.assertIn('fee_category', dims)

    def test_class_teacher_sees_no_fees(self):
        groups = {m.group for m in visible_metrics(Role.CLASS_TEACHER)}
        self.assertEqual(groups, {'enrolment', 'academics'})

    def test_non_analytics_role_sees_nothing(self):
        self.assertEqual(visible_metrics(Role.PARENT), [])
        self.assertEqual(catalogue(Role.SUBJECT_TEACHER)['dimensions'], [])


class WeightedAverageTests(TestCase):
    """Mean score is Σ score / Σ marks over the cell's marks (D6).

    STD1: one pupil, three subjects: 40, 50, 60 → class mean 50
    STD2: one pupil, one subject:    90         → class mean 90

    The right school mean is (40+50+60+90) / 4 = 60. Averaging the two class
    means, or the two pupils' means, gives (50+90) / 2 = 70, which
    over-weights the pupil with a single mark.
    """

    def setUp(self):
        self.year = make_academic_year_2026()
        teacher = make_user(role=Role.ACADEMIC_TEACHER)
        subjects = [make_subject() for _ in range(3)]
        pupil1 = make_student(level='STD1')
        pupil2 = make_student(level='STD2')

        def exam(level):
            return Exam.objects.create(
                name=f'Midterm {level}', academic_year=self.year, term='TERM1',
                quarter='Q1', level=level, exam_type=ExamType.MIDTERM,
                start_date=datetime.date(2026, 3, 1), end_date=datetime.date(2026, 3, 5),
                created_by=teacher,
            )

        std1, std2 = exam('STD1'), exam('STD2')
        for subject, score in zip(subjects, ('40', '50', '60')):
            MarkEntry.objects.create(exam=std1, student=pupil1, subject=subject,
                                     score=Decimal(score), entered_by=teacher)
        MarkEntry.objects.create(exam=std2, student=pupil2, subject=subjects[0],
                                 score=Decimal('90'), entered_by=teacher)
        self.metric = METRICS['exam.mean_score']
        self.ou = DIMENSIONS['ou']

    def test_per_class_means(self):
        cells = evaluate(self.metric, group_by=[self.ou.field_for('marks', 'level')])
        self.assertEqual({c.keys[0]: c.value for c in cells},
                         {'STD1': Decimal('50'), 'STD2': Decimal('90')})

    def test_total_is_weighted_not_mean_of_means(self):
        cells = evaluate(self.metric, group_by=[self.ou.field_for('marks', 'level')])
        naive = sum(c.value for c in cells) / len(cells)
        self.assertEqual(naive, Decimal('70'))  # the wrong answer

        [total] = evaluate(self.metric)
        self.assertEqual(total.value, Decimal('60'))
        self.assertNotEqual(total.value, naive)

    def test_not_mean_of_per_student_means(self):
        per_student = evaluate(self.metric, group_by=['student_id'])
        naive = sum(c.value for c in per_student) / len(per_student)
        self.assertEqual(naive, Decimal('70'))
        [total] = evaluate(self.metric)
        self.assertEqual(total.value, Decimal('60'))

    def test_cells_carry_parts_so_subtotals_stay_weighted(self):
        cells = evaluate(self.metric, group_by=[self.ou.field_for('marks', 'level')])
        num = sum(c.numerator for c in cells)
        den = sum(c.denominator for c in cells)
        self.assertEqual(self.metric.compute(num, den), Decimal('60'))

    def test_level_group_rollup_is_weighted(self):
        cells = evaluate(self.metric, group_by=[self.ou.field_for('marks', 'level_group')])
        self.assertEqual([(c.keys[0], c.value) for c in cells], [('PRIMARY', Decimal('60'))])


class MarksStreamFallbackTests(TestCase):
    def test_whole_level_exam_uses_the_enrolment_stream_of_the_exam_year(self):
        """Until P1 snapshots land, a mark on a whole-level exam belongs to
        the pupil's stream in the exam's year, not their stream today."""
        past = AcademicYear.objects.create(year=2025, is_current=False)
        teacher = make_user(role=Role.ACADEMIC_TEACHER)
        pupil = make_student(level='STD2', stream='B')
        Enrolment.objects.create(student=pupil, academic_year=past, level='STD1', stream='A',
                                 status=StudentStatus.ACTIVE, enrolled_on=datetime.date(2025, 1, 8))
        exam = Exam.objects.create(
            name='Terminal', academic_year=past, term='TERM2', quarter='Q4', level='STD1',
            exam_type=ExamType.TERMINAL, start_date=datetime.date(2025, 11, 1),
            end_date=datetime.date(2025, 11, 5), created_by=teacher,
        )
        MarkEntry.objects.create(exam=exam, student=pupil, subject=make_subject(),
                                 score=Decimal('70'), entered_by=teacher)

        ou = DIMENSIONS['ou']
        cells = evaluate(METRICS['exam.marks_count'],
                         group_by=[ou.field_for('marks', 'level'), ou.field_for('marks', 'stream')])
        self.assertEqual([c.keys for c in cells], [('STD1', 'A')])


class DimensionKindsTests(TestCase):
    def test_core_dimensions_present(self):
        self.assertEqual(DIMENSIONS['dx'].kind, DimensionKind.DATA)
        self.assertEqual(DIMENSIONS['pe'].kind, DimensionKind.PERIOD)
        self.assertEqual(DIMENSIONS['ou'].kind, DimensionKind.ORG_UNIT)
        self.assertEqual([lv.id for lv in DIMENSIONS['ou'].levels],
                         ['level_group', 'level', 'stream'])
