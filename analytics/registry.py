"""
The analytics registry: every metric, dimension and fact source the
analytics module knows about (ANALYTICS_PLAN.md §4, §5). Views and the query
engine read definitions from here; no metric is hard-coded anywhere else.

Three kinds of definition:

* **Fact sources**: one queryable table at a fixed grain (a mark, an invoice
  line, an allocation…), with the modules it needs and how it attaches to a
  period (§3.2).
* **Metrics**: a fact source, a function returning the queryset *at fact
  grain*, and a numerator (plus a denominator for ratios and weighted
  averages). The engine aggregates numerator and denominator per output
  cell and divides at the very end, so averages are always weighted (D6):
  they are never an average of pre-aggregated averages.
* **Dimensions**: `dx` (data), `pe` (period), `ou` (org unit) and the dynamic
  ones (gender, subject…). Each maps every fact source it applies to onto
  the ORM path (or expression) to group by.

Everything is filtered by `ENABLED_MODULES` and by the caller's role groups
(`analytics.permissions`), so a disabled module's metrics and dimensions
disappear entirely (§6.5).

Metrics deferred until their prerequisite lands: `exam.pass_rate` and
`exam.grade_share` (P9 grading snapshot), `exam.completion_rate` (P10 class
streams), `fees.mean_balance` / `fees.median_balance` (student-grain subquery),
and every attendance metric (D1).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Callable, Mapping, Union

from django.db.models import (
    Aggregate, CharField, Count, DecimalField, Expression, F, FloatField, Max, Min,
    OuterRef, Q, QuerySet, StdDev, Subquery, Sum, Value,
)
from django.db.models import Case, When
from django.db.models.functions import Coalesce, ExtractYear, NullIf
from django.db.models.lookups import In
from django.utils import timezone

from accounts.models import SchoolSettings
from communications.models import SmsBatch, SmsMessage
from exams.models import ExamType, MarkEntry, SkillName, StudentSkillAssessment, Subject
from fees.models import (
    AcademicYear, FeeAdjustment, FeeCategory, InvoiceKind, InvoiceLine, LineStatus,
    Payment, PaymentAllocation, PaymentMethod, PaymentStatus,
)
from fees.reports import FEE_KINDS, _outstanding_lines
from students.level_groups import LEVELS_BY_GROUP, LevelGroup
from students.models import Enrolment, Level, Stream, Student, StudentStatus

from .periods import PERIOD_TYPES, RELATIVE_PERIODS, PeriodType
from .permissions import GROUP_LABELS, GROUP_MODULES, MetricGroup, groups_for_role, modules_enabled

_DEC = DecimalField(max_digits=14, decimal_places=2)
_ZERO = Value(Decimal('0'), output_field=_DEC)

# A group-by target: an ORM path, or a factory for an expression when the
# value needs a join or fallback a path can't express.
FieldRef = Union[str, Callable[[], Expression]]


def as_expression(ref: FieldRef) -> Expression:
    return F(ref) if isinstance(ref, str) else ref()


class Aggregation:
    SUM = 'sum'
    COUNT = 'count'
    COUNT_DISTINCT = 'count_distinct'
    WEIGHTED_AVG = 'weighted_avg'
    RATIO = 'ratio'
    DISTRIBUTION = 'distribution'


class Percentile(Aggregate):
    """Postgres `percentile_cont(p) WITHIN GROUP (ORDER BY x)`."""
    function = 'PERCENTILE_CONT'
    name = 'Percentile'
    template = '%(function)s(%(percentile)s) WITHIN GROUP (ORDER BY %(expressions)s)'

    def __init__(self, expression, percentile: float, **extra):
        if not 0 <= percentile <= 1:
            raise ValueError('percentile must be between 0 and 1')
        super().__init__(
            expression, percentile=repr(float(percentile)),
            output_field=FloatField(), **extra,
        )


# ── fact sources ───────────────────────────────────────────────────────────

@dataclass(frozen=True)
class PeriodBinding:
    """How a fact attaches to a period (§3.2): academic (year/term/quarter
    columns), a date/datetime column, or academic year only."""
    year: str | None = None
    term: str | None = None
    quarter: str | None = None
    date: str | None = None

    @property
    def period_types(self) -> list[str]:
        if self.date:
            return [t for t, _ in PERIOD_TYPES]
        types = [PeriodType.YEAR]
        if self.term:
            types.append(PeriodType.TERM)
        if self.quarter:
            types.append(PeriodType.QUARTER)
        return types


@dataclass(frozen=True)
class FactSource:
    id: str
    label: str
    grain: str
    period: PeriodBinding
    modules: tuple[str, ...] = ()
    # Path from the fact to students.Student, for the student dimensions.
    student: str | None = None

    @property
    def enabled(self) -> bool:
        return modules_enabled(self.modules)


_SOURCES = [
    FactSource(
        'enrolment', 'Enrolment', 'student × academic year',
        PeriodBinding(year='academic_year__year'), student='student',
    ),
    FactSource(
        'admissions', 'Admissions', 'student',
        PeriodBinding(date='admission_date'), student='',
    ),
    FactSource(
        'marks', 'Marks', 'pupil × subject × exam',
        PeriodBinding(year='exam__academic_year__year', term='exam__term', quarter='exam__quarter'),
        modules=('exams', 'reports'), student='student',
    ),
    FactSource(
        'skills', 'Skill assessments', 'pupil × skill × exam',
        PeriodBinding(year='exam__academic_year__year', term='exam__term', quarter='exam__quarter'),
        modules=('exams', 'reports'), student='student',
    ),
    FactSource(
        'fee_lines', 'Fee charges', 'invoice line',
        PeriodBinding(year='invoice__academic_year__year', term='invoice__term',
                      quarter='invoice__quarter'),
        modules=('fees',), student='invoice__student',
    ),
    FactSource(
        # SALE invoices have no term/quarter; a sale is dated by its line (P3).
        'fee_sales', 'Uniform sales', 'invoice line',
        PeriodBinding(date='created_at'),
        modules=('fees',), student='invoice__student',
    ),
    FactSource(
        # Allocations in the billing period of the line they paid (D3).
        'fee_allocations', 'Payments (billing period)', 'payment allocation',
        PeriodBinding(year='invoice_line__invoice__academic_year__year',
                      term='invoice_line__invoice__term',
                      quarter='invoice_line__invoice__quarter'),
        modules=('fees',), student='invoice_line__invoice__student',
    ),
    FactSource(
        # The same allocations, in the period the cash arrived (D3).
        'fee_cash', 'Payments (payment date)', 'payment allocation',
        PeriodBinding(date='payment__paid_at'),
        modules=('fees',), student='invoice_line__invoice__student',
    ),
    FactSource(
        'fee_adjustments', 'Fee adjustments', 'adjustment',
        PeriodBinding(year='invoice_line__invoice__academic_year__year',
                      term='invoice_line__invoice__term',
                      quarter='invoice_line__invoice__quarter'),
        modules=('fees',), student='invoice_line__invoice__student',
    ),
    FactSource(
        'fee_reversals', 'Reversed payments', 'payment',
        PeriodBinding(date='reversed_at'),
        modules=('fees',), student='student',
    ),
    FactSource(
        'sms', 'SMS messages', 'recipient × batch',
        PeriodBinding(date='created_at'),
        modules=('sms',), student='student',
    ),
]
SOURCES: dict[str, FactSource] = {s.id: s for s in _SOURCES}


# ── metrics ────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Metric:
    id: str
    label: str
    description: str
    group: str
    source: str
    aggregation: str
    # The facts, filtered and annotated, one row per fact.
    queryset: Callable[[], QuerySet]
    numerator: Callable[[], Aggregate]
    denominator: Callable[[], Aggregate] | None = None
    scale: int = 1          # 100 for percentages
    unit: str = 'count'     # count | percent | score | TZS
    # Score metrics are masked in small cells (D18).
    masked: bool = False

    @property
    def modules(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys(GROUP_MODULES[self.group] + SOURCES[self.source].modules))

    @property
    def enabled(self) -> bool:
        return modules_enabled(self.modules)

    def compute(self, numerator, denominator=None):
        """The metric value from its aggregated parts. Division happens here,
        once, after both parts were summed over the whole cell."""
        if numerator is None:
            return None
        num = Decimal(str(numerator))
        if self.denominator is not None:
            if not denominator:
                return None
            return num / Decimal(str(denominator)) * self.scale
        return num * self.scale


def _enrolled():
    return Enrolment.objects.filter(status__in=[StudentStatus.ACTIVE, StudentStatus.SUSPENDED])


def _marks():
    return MarkEntry.objects.all()


def _fee_lines():
    return InvoiceLine.objects.filter(invoice__kind__in=FEE_KINDS).exclude(status=LineStatus.VOID)


def _allocations():
    return PaymentAllocation.objects.filter(payment__status=PaymentStatus.ACTIVE)


def _cash_allocations():
    return _allocations().exclude(payment__payment_method=PaymentMethod.CARRIED_CREDIT)


def _lines_with_collected():
    collected = (
        PaymentAllocation.objects
        .filter(invoice_line=OuterRef('pk'), payment__status=PaymentStatus.ACTIVE)
        .exclude(payment__payment_method=PaymentMethod.CARRIED_CREDIT)
        .values('invoice_line')
        .annotate(s=Sum('amount'))
        .values('s')
    )
    return _outstanding_lines().annotate(
        collected=Coalesce(Subquery(collected, output_field=_DEC), _ZERO),
    )


def _defaulter_lines():
    return _outstanding_lines().filter(unpaid__gt=0, invoice__due_date__lt=timezone.localdate())


def _sms():
    return SmsMessage.objects.filter(batch__dry_run=False)


_SMS_SENT = Q(status__in=[SmsMessage.Status.SENT, SmsMessage.Status.DELIVERED])

_METRICS = [
    # ── enrolment (core) ──
    Metric(
        'enrol.enrolled', 'Enrolled students',
        'Students enrolled in the year (active or suspended).',
        MetricGroup.ENROLMENT, 'enrolment', Aggregation.COUNT,
        _enrolled, lambda: Count('pk'),
    ),
    Metric(
        'enrol.by_status', 'Students by status',
        'Enrolment records of every status; break down by status.',
        MetricGroup.ENROLMENT, 'enrolment', Aggregation.COUNT,
        Enrolment.objects.all, lambda: Count('pk'),
    ),
    Metric(
        'enrol.left', 'Left during year',
        'Students who stopped being active during the year.',
        MetricGroup.ENROLMENT, 'enrolment', Aggregation.COUNT,
        lambda: Enrolment.objects.filter(left_on__isnull=False), lambda: Count('pk'),
    ),
    Metric(
        'enrol.new_admissions', 'New admissions',
        'Students whose admission date falls in the period.',
        MetricGroup.ENROLMENT, 'admissions', Aggregation.COUNT,
        Student.objects.all, lambda: Count('pk'),
    ),
    Metric(
        'enrol.special_needs_pct', '% with special needs',
        'Share of enrolled students flagged with special needs.',
        MetricGroup.ENROLMENT, 'enrolment', Aggregation.RATIO,
        _enrolled,
        lambda: Count('pk', filter=Q(student__has_special_needs=True)),
        lambda: Count('pk'),
        scale=100, unit='percent',
    ),
    Metric(
        'enrol.gender_ratio', 'Girls per 100 boys',
        'Enrolled girls per 100 enrolled boys.',
        MetricGroup.ENROLMENT, 'enrolment', Aggregation.RATIO,
        _enrolled,
        lambda: Count('pk', filter=Q(student__gender='F')),
        lambda: Count('pk', filter=Q(student__gender='M')),
        scale=100, unit='ratio',
    ),

    # ── academics (exams + reports) ──
    Metric(
        'exam.marks_count', 'Marks entered', 'Number of subject marks entered.',
        MetricGroup.ACADEMICS, 'marks', Aggregation.COUNT,
        _marks, lambda: Count('pk'),
    ),
    Metric(
        'exam.mean_score', 'Mean score (%)',
        'Sum of all marks divided by the number of marks; every mark counts equally.',
        MetricGroup.ACADEMICS, 'marks', Aggregation.WEIGHTED_AVG,
        _marks, lambda: Sum('score'), lambda: Count('score'),
        unit='score', masked=True,
    ),
    Metric(
        'exam.median_score', 'Median score (%)', 'Middle mark of all marks in the cell.',
        MetricGroup.ACADEMICS, 'marks', Aggregation.DISTRIBUTION,
        _marks, lambda: Percentile('score', 0.5), unit='score', masked=True,
    ),
    Metric(
        'exam.p25_score', 'Lower quartile (%)', '25th percentile of marks.',
        MetricGroup.ACADEMICS, 'marks', Aggregation.DISTRIBUTION,
        _marks, lambda: Percentile('score', 0.25), unit='score', masked=True,
    ),
    Metric(
        'exam.p75_score', 'Upper quartile (%)', '75th percentile of marks.',
        MetricGroup.ACADEMICS, 'marks', Aggregation.DISTRIBUTION,
        _marks, lambda: Percentile('score', 0.75), unit='score', masked=True,
    ),
    Metric(
        'exam.min_score', 'Lowest score (%)', 'Lowest mark in the cell.',
        MetricGroup.ACADEMICS, 'marks', Aggregation.DISTRIBUTION,
        _marks, lambda: Min('score'), unit='score', masked=True,
    ),
    Metric(
        'exam.max_score', 'Highest score (%)', 'Highest mark in the cell.',
        MetricGroup.ACADEMICS, 'marks', Aggregation.DISTRIBUTION,
        _marks, lambda: Max('score'), unit='score', masked=True,
    ),
    Metric(
        'exam.stddev_score', 'Standard deviation', 'Sample standard deviation of marks.',
        MetricGroup.ACADEMICS, 'marks', Aggregation.DISTRIBUTION,
        _marks, lambda: StdDev('score', sample=True), unit='score', masked=True,
    ),
    Metric(
        'exam.candidates', 'Candidates sat', 'Distinct pupils with at least one mark.',
        MetricGroup.ACADEMICS, 'marks', Aggregation.COUNT_DISTINCT,
        _marks, lambda: Count('student', distinct=True),
    ),
    Metric(
        'exam.skill_marks_mean', 'Skill mean',
        'Mean of skill marks; assessments without marks are left out of both parts.',
        MetricGroup.ACADEMICS, 'skills', Aggregation.WEIGHTED_AVG,
        StudentSkillAssessment.objects.all, lambda: Sum('marks'), lambda: Count('marks'),
        unit='score', masked=True,
    ),

    # ── fees ──
    Metric(
        'fees.billed', 'Billed (gross)', 'Fee charges before discounts, excluding void lines.',
        MetricGroup.FEES, 'fee_lines', Aggregation.SUM,
        _fee_lines, lambda: Sum('amount'), unit='TZS',
    ),
    Metric(
        'fees.adjustments', 'Discounts & waivers',
        'Discounts, waivers, scholarships and bursaries on non-void lines.',
        MetricGroup.FEES, 'fee_adjustments', Aggregation.SUM,
        lambda: FeeAdjustment.objects.exclude(invoice_line__status=LineStatus.VOID),
        lambda: Sum('amount'), unit='TZS',
    ),
    Metric(
        'fees.required', 'Net required', 'Charges after adjustments, never below zero.',
        MetricGroup.FEES, 'fee_lines', Aggregation.SUM,
        _outstanding_lines, lambda: Sum('required'), unit='TZS',
    ),
    Metric(
        'fees.outstanding', 'Outstanding', 'Net required not yet paid.',
        MetricGroup.FEES, 'fee_lines', Aggregation.SUM,
        _outstanding_lines, lambda: Sum('unpaid'), unit='TZS',
    ),
    Metric(
        'fees.collected', 'Collected (billing period)',
        'Payments counted in the period of the fee they paid. Excludes carried credit.',
        MetricGroup.FEES, 'fee_allocations', Aggregation.SUM,
        _cash_allocations, lambda: Sum('amount'), unit='TZS',
    ),
    Metric(
        'fees.cash_in', 'Cash received (payment date)',
        'Payments counted in the period the money arrived. Excludes carried credit.',
        MetricGroup.FEES, 'fee_cash', Aggregation.SUM,
        _cash_allocations, lambda: Sum('amount'), unit='TZS',
    ),
    Metric(
        'fees.collection_rate', 'Collection rate (%)',
        'Collected divided by net required, per fee line summed over the cell.',
        MetricGroup.FEES, 'fee_lines', Aggregation.RATIO,
        _lines_with_collected, lambda: Sum('collected'), lambda: Sum('required'),
        scale=100, unit='percent',
    ),
    Metric(
        'fees.sales_revenue', 'Uniform sales', 'Walk-in uniform sales, excluding void lines.',
        MetricGroup.FEES, 'fee_sales', Aggregation.SUM,
        lambda: InvoiceLine.objects.filter(is_sale=True).exclude(status=LineStatus.VOID),
        lambda: Sum('amount'), unit='TZS',
    ),
    Metric(
        'fees.credit_applied', 'Credit applied', 'Carried-forward credit used to pay fees.',
        MetricGroup.FEES, 'fee_allocations', Aggregation.SUM,
        lambda: _allocations().filter(payment__payment_method=PaymentMethod.CARRIED_CREDIT),
        lambda: Sum('amount'), unit='TZS',
    ),
    Metric(
        'fees.reversals', 'Reversed payments', 'Payments reversed in the period.',
        MetricGroup.FEES, 'fee_reversals', Aggregation.SUM,
        lambda: Payment.objects.filter(status=PaymentStatus.REVERSED),
        lambda: Sum('amount'), unit='TZS',
    ),
    Metric(
        'fees.payers', 'Paying students', 'Distinct students who paid in the period.',
        MetricGroup.FEES, 'fee_cash', Aggregation.COUNT_DISTINCT,
        _cash_allocations, lambda: Count('payment__student', distinct=True),
    ),
    Metric(
        'fees.defaulters', 'Students with arrears',
        'Distinct students with an unpaid fee past its due date.',
        MetricGroup.FEES, 'fee_lines', Aggregation.COUNT_DISTINCT,
        _defaulter_lines, lambda: Count('invoice__student', distinct=True),
    ),

    # ── sms ──
    Metric(
        'sms.messages', 'SMS messages', 'Messages built for sending (excludes dry runs).',
        MetricGroup.SMS, 'sms', Aggregation.COUNT,
        _sms, lambda: Count('pk'),
    ),
    Metric(
        'sms.delivered_rate', 'Delivery rate (%)',
        'Sent or delivered, out of messages that were not skipped.',
        MetricGroup.SMS, 'sms', Aggregation.RATIO,
        _sms,
        lambda: Count('pk', filter=_SMS_SENT),
        lambda: Count('pk', filter=~Q(status=SmsMessage.Status.SKIPPED)),
        scale=100, unit='percent',
    ),
    Metric(
        'sms.failed', 'Failed SMS', 'Messages the provider rejected.',
        MetricGroup.SMS, 'sms', Aggregation.COUNT,
        _sms, lambda: Count('pk', filter=Q(status=SmsMessage.Status.FAILED)),
    ),
    Metric(
        'sms.skipped', 'Skipped SMS', 'Messages skipped before sending (opt-out, no phone…).',
        MetricGroup.SMS, 'sms', Aggregation.COUNT,
        _sms, lambda: Count('pk', filter=Q(status=SmsMessage.Status.SKIPPED)),
    ),
    Metric(
        'sms.segments', 'SMS segments', 'Billable message segments.',
        MetricGroup.SMS, 'sms', Aggregation.SUM,
        _sms, lambda: Sum('segments'),
    ),
    Metric(
        'sms.cost', 'SMS cost', 'Provider cost of the messages.',
        MetricGroup.SMS, 'sms', Aggregation.SUM,
        _sms, lambda: Sum('cost'), unit='TZS',
    ),
]
METRICS: dict[str, Metric] = {m.id: m for m in _METRICS}


# ── org-unit expressions (§2) ──────────────────────────────────────────────

def _enrolment_value(field_name: str, student: str, year_filter: dict):
    """The student's Enrolment `field_name` for one academic year."""
    return Subquery(
        Enrolment.objects
        .filter(student_id=OuterRef(student), **year_filter)
        .order_by()  # unique per (student, year); Meta.ordering would sort per row
        .values(field_name)[:1],
        output_field=CharField(),
    )


def _coalesce_text(*parts):
    return Coalesce(*parts, output_field=CharField())


def _level_group(level_ref: FieldRef) -> Callable[[], Expression]:
    def condition(levels):
        if isinstance(level_ref, str):
            return Q(**{f'{level_ref}__in': list(levels)})
        return In(level_ref(), list(levels))

    def build():
        return Case(
            *[When(condition(levels), then=Value(str(group)))
              for group, levels in LEVELS_BY_GROUP.items()],
            default=Value(''),
            output_field=CharField(),
        )
    return build


# Marks: the class snapshot (P1) isn't on MarkEntry yet, so derive it the way
# P1's backfill will: level = exam.level; stream = exam.stream, else the
# pupil's Enrolment for the exam year, else their current stream (D22).
# TODO(P1): switch to `level_snapshot` / `stream_snapshot`.
def _marks_stream():
    return _coalesce_text(
        NullIf(F('exam__stream'), Value('')),
        _enrolment_value('stream', 'student_id', {'academic_year_id': OuterRef('exam__academic_year_id')}),
        F('student__stream'),
    )


def _enrolment_stream_for(student: str, year: str) -> Callable[[], Expression]:
    return lambda: _enrolment_value('stream', student, {'academic_year_id': OuterRef(year)})


def _sms_class(field_name: str) -> Callable[[], Expression]:
    # Enrolment for the year the message was created, else the current class.
    return lambda: _coalesce_text(
        _enrolment_value(
            field_name, 'student_id',
            {'academic_year__year': ExtractYear(OuterRef('created_at'))},
        ),
        F(f'student__{field_name}'),
    )


_LEVEL_PATHS: dict[str, FieldRef] = {
    'enrolment': 'level',
    'marks': 'exam__level',
    'skills': 'exam__level',
    'fee_lines': 'level_snapshot',
    'fee_sales': 'level_snapshot',
    'fee_allocations': 'invoice_line__level_snapshot',
    'fee_cash': 'invoice_line__level_snapshot',
    'fee_adjustments': 'invoice_line__level_snapshot',
    'sms': _sms_class('level'),
}

_STREAM_PATHS: dict[str, FieldRef] = {
    'enrolment': 'stream',
    'marks': _marks_stream,
    'skills': _marks_stream,
    'fee_lines': _enrolment_stream_for('invoice__student_id', 'invoice__academic_year_id'),
    'fee_allocations': _enrolment_stream_for(
        'invoice_line__invoice__student_id', 'invoice_line__invoice__academic_year_id'),
    'fee_cash': _enrolment_stream_for(
        'invoice_line__invoice__student_id', 'invoice_line__invoice__academic_year_id'),
    'fee_adjustments': _enrolment_stream_for(
        'invoice_line__invoice__student_id', 'invoice_line__invoice__academic_year_id'),
    'sms': _sms_class('stream'),
}


# ── dimensions ─────────────────────────────────────────────────────────────

class DimensionKind:
    DATA = 'data'
    PERIOD = 'period'
    ORG_UNIT = 'org_unit'
    DYNAMIC = 'dynamic'


@dataclass(frozen=True)
class OrgUnitLevel:
    id: str
    label: str
    group_by: Mapping[str, FieldRef]


@dataclass(frozen=True)
class Dimension:
    id: str
    label: str
    kind: str
    # Fact source id → what to group by. For `pe` this is empty: periods
    # attach through each source's PeriodBinding.
    group_by: Mapping[str, FieldRef] = field(default_factory=dict)
    items: Callable[[], list[dict]] | None = None
    modules: tuple[str, ...] = ()
    levels: tuple[OrgUnitLevel, ...] = ()
    filter_only: bool = False

    @property
    def source_ids(self) -> list[str]:
        if self.kind in (DimensionKind.DATA, DimensionKind.PERIOD):
            return list(SOURCES)
        return list(self.group_by)

    @property
    def enabled(self) -> bool:
        return modules_enabled(self.modules)

    def field_for(self, source_id: str, level: str | None = None) -> FieldRef:
        """The group-by target for a fact source (and org-unit level)."""
        mapping = self.group_by
        if level is not None:
            mapping = next(lv.group_by for lv in self.levels if lv.id == level)
        return mapping[source_id]


def _choices_items(choices) -> Callable[[], list[dict]]:
    return lambda: [{'id': value, 'label': str(label)} for value, label in choices]


def _student_paths(attr: str) -> dict[str, str]:
    return {
        s.id: f'{s.student}__{attr}' if s.student else attr
        for s in _SOURCES if s.student is not None
    }


def _metric_items(metrics) -> list[dict]:
    return [
        {
            'id': m.id, 'label': m.label, 'description': m.description,
            'group': m.group, 'source': m.source, 'aggregation': m.aggregation,
            'unit': m.unit, 'modules': list(m.modules), 'masked': m.masked,
        }
        for m in metrics
    ]


def _period_items() -> list[dict]:
    relative = [
        {'id': code, 'label': label, 'type': 'relative', 'period_type': ptype}
        for code, label, ptype in RELATIVE_PERIODS
    ]
    years = [
        {'id': str(y), 'label': str(y), 'type': 'fixed', 'period_type': PeriodType.YEAR}
        for y in AcademicYear.objects.order_by('-year').values_list('year', flat=True)
    ]
    return relative + years


_LEVEL_LABELS = dict(Level.choices)
_LEVEL_ORDER = {value: i for i, (value, _) in enumerate(Level.choices)}


def _org_unit_items() -> list[dict]:
    """School → level group → level → stream, pruned to the school's active
    level groups. Streams come from the current year's enrolment until
    ClassStream (P10) records which streams each class has."""
    school = SchoolSettings.objects.filter(pk=1).first()
    active = set(school.active_levels) if school and school.active_levels else set(LEVELS_BY_GROUP)

    current = AcademicYear.objects.filter(is_current=True).first()
    pairs = (
        Enrolment.objects.filter(academic_year=current) if current
        else Student.objects.filter(status=StudentStatus.ACTIVE)
    ).exclude(stream='').values_list('level', 'stream').distinct()
    streams: dict[str, list[str]] = {}
    for level, stream in pairs:
        streams.setdefault(level, []).append(stream)

    groups = []
    for group, levels in LEVELS_BY_GROUP.items():
        if group not in active:
            continue
        groups.append({
            'id': str(group), 'label': LevelGroup(group).label, 'level': 'level_group',
            'children': [
                {
                    'id': str(level), 'label': _LEVEL_LABELS[level], 'level': 'level',
                    'children': [
                        {'id': f'{level}/{s}', 'label': f'{_LEVEL_LABELS[level]} {s}',
                         'level': 'stream'}
                        for s in sorted(streams.get(level, []))
                    ],
                }
                for level in sorted(levels, key=_LEVEL_ORDER.get)
            ],
        })
    return [{
        'id': 'SCHOOL', 'label': school.school_name if school else 'School',
        'level': 'school', 'children': groups,
    }]


def org_unit_lookup() -> dict[str, dict]:
    """Every org-unit id a query may name → its tree level and label. Wider
    than `_org_unit_items`: any class × managed stream is accepted, so past
    years' classes stay queryable."""
    school = SchoolSettings.objects.filter(pk=1).first()
    units = {'SCHOOL': {'level': 'school', 'label': school.school_name if school else 'School'}}
    for group in LEVELS_BY_GROUP:
        units[str(group)] = {'level': 'level_group', 'label': LevelGroup(group).label}
    for level, label in Level.choices:
        units[level] = {'level': 'level', 'label': str(label)}
    for stream in Stream.objects.values_list('name', flat=True):
        for level, label in Level.choices:
            units[f'{level}/{stream}'] = {'level': 'stream', 'label': f'{label} {stream}'}
    return units


def _subject_items() -> list[dict]:
    # Subject codes are unique, so they are the item ids (`subject:MATH`).
    return [
        {'id': code, 'label': f'{code} — {name}', 'level_group': group}
        for code, name, group in Subject.objects.filter(is_active=True)
        .values_list('code', 'name', 'level_group')
    ]


_BOOL_ITEMS = lambda: [{'id': 'true', 'label': 'Yes'}, {'id': 'false', 'label': 'No'}]  # noqa: E731
_GRADES = lambda: [{'id': g, 'label': g} for g in ('A', 'B', 'C', 'D', 'F')]  # noqa: E731

_DIMENSIONS = [
    Dimension('dx', 'Data', DimensionKind.DATA),
    Dimension('pe', 'Period', DimensionKind.PERIOD, items=_period_items),
    Dimension(
        'ou', 'Org unit', DimensionKind.ORG_UNIT,
        group_by=_LEVEL_PATHS, items=_org_unit_items,
        levels=(
            OrgUnitLevel('level_group', 'Level group',
                         {s: _level_group(ref) for s, ref in _LEVEL_PATHS.items()}),
            OrgUnitLevel('level', 'Class', _LEVEL_PATHS),
            OrgUnitLevel('stream', 'Stream', _STREAM_PATHS),
        ),
    ),

    # student attributes (core)
    Dimension('gender', 'Gender', DimensionKind.DYNAMIC,
              group_by=_student_paths('gender'),
              items=_choices_items([('M', 'Male'), ('F', 'Female')])),
    Dimension('special_needs', 'Special needs', DimensionKind.DYNAMIC,
              group_by=_student_paths('has_special_needs'), items=_BOOL_ITEMS),
    Dimension('enrolment_status', 'Student status', DimensionKind.DYNAMIC,
              group_by={'enrolment': 'status'},
              items=_choices_items(StudentStatus.choices)),

    # academics
    Dimension('subject', 'Subject', DimensionKind.DYNAMIC,
              group_by={'marks': 'subject__code'}, items=_subject_items, modules=('exams',)),
    Dimension('subject_level_group', 'Subject level group', DimensionKind.DYNAMIC,
              group_by={'marks': 'subject__level_group'},
              items=_choices_items(LevelGroup.choices), modules=('exams',)),
    Dimension('subject_compulsory', 'Compulsory subject', DimensionKind.DYNAMIC,
              group_by={'marks': 'subject__is_compulsory'}, items=_BOOL_ITEMS,
              modules=('exams',)),
    Dimension('exam_type', 'Exam type', DimensionKind.DYNAMIC,
              group_by={'marks': 'exam__exam_type', 'skills': 'exam__exam_type'},
              items=_choices_items(ExamType.choices), modules=('exams',)),
    Dimension('exam', 'Exam', DimensionKind.DYNAMIC,
              group_by={'marks': 'exam_id', 'skills': 'exam_id'},
              modules=('exams',), filter_only=True),
    Dimension('grade', 'Grade', DimensionKind.DYNAMIC,
              group_by={'marks': 'grade'}, items=_GRADES, modules=('exams',)),
    Dimension('skill', 'Skill', DimensionKind.DYNAMIC,
              group_by={'skills': 'skill'}, items=_choices_items(SkillName.choices),
              modules=('reports',)),

    # fees
    Dimension('fee_category', 'Fee category', DimensionKind.DYNAMIC,
              group_by={
                  'fee_lines': 'category', 'fee_sales': 'category',
                  'fee_allocations': 'invoice_line__category',
                  'fee_cash': 'invoice_line__category',
                  'fee_adjustments': 'invoice_line__category',
              },
              items=_choices_items(FeeCategory.choices), modules=('fees',)),
    Dimension('invoice_kind', 'Invoice kind', DimensionKind.DYNAMIC,
              group_by={
                  'fee_lines': 'invoice__kind',
                  'fee_allocations': 'invoice_line__invoice__kind',
                  'fee_cash': 'invoice_line__invoice__kind',
                  'fee_adjustments': 'invoice_line__invoice__kind',
              },
              items=_choices_items(InvoiceKind.choices), modules=('fees',)),
    Dimension('line_status', 'Charge status', DimensionKind.DYNAMIC,
              group_by={'fee_lines': 'status'},
              items=_choices_items(LineStatus.choices), modules=('fees',)),
    Dimension('payment_method', 'Payment method', DimensionKind.DYNAMIC,
              group_by={
                  'fee_allocations': 'payment__payment_method',
                  'fee_cash': 'payment__payment_method',
                  'fee_reversals': 'payment_method',
              },
              items=_choices_items(PaymentMethod.choices), modules=('fees',)),
    Dimension('adjustment_kind', 'Adjustment kind', DimensionKind.DYNAMIC,
              group_by={'fee_adjustments': 'kind'},
              items=_choices_items(FeeAdjustment.Kind.choices), modules=('fees',)),

    # sms
    Dimension('sms_kind', 'SMS kind', DimensionKind.DYNAMIC,
              group_by={'sms': 'batch__kind'},
              items=_choices_items(SmsBatch.Kind.choices),
              modules=('sms',)),
    Dimension('sms_status', 'SMS status', DimensionKind.DYNAMIC,
              group_by={'sms': 'status'},
              items=_choices_items(SmsMessage.Status.choices), modules=('sms',)),
]
DIMENSIONS: dict[str, Dimension] = {d.id: d for d in _DIMENSIONS}


# ── module- and role-aware views of the registry ───────────────────────────

def visible_groups(role=None) -> list[str]:
    """Metric groups whose modules are on, narrowed to `role` when given."""
    if role is None:
        return [g for g, modules in GROUP_MODULES.items() if modules_enabled(modules)]
    return groups_for_role(role)


def visible_metrics(role=None) -> list[Metric]:
    groups = set(visible_groups(role))
    return [m for m in _METRICS if m.group in groups and m.enabled]


def visible_sources(role=None) -> list[FactSource]:
    """Sources that back at least one visible metric."""
    used = {m.source for m in visible_metrics(role)}
    return [s for s in _SOURCES if s.id in used and s.enabled]


def visible_dimensions(role=None) -> list[tuple[Dimension, list[str]]]:
    """(dimension, the visible source ids it applies to) for every dimension
    that applies to at least one visible source."""
    source_ids = {s.id for s in visible_sources(role)}
    out = []
    for dim in _DIMENSIONS:
        if not dim.enabled:
            continue
        applies = [s for s in dim.source_ids if s in source_ids]
        if applies:
            out.append((dim, applies))
    return out


def catalogue(role=None) -> dict:
    """The registry as the frontend sees it: module- and role-filtered, with
    no ORM paths."""
    metrics = visible_metrics(role)
    sources = visible_sources(role)
    dimensions = []
    for dim, applies in visible_dimensions(role):
        entry = {
            'id': dim.id, 'label': dim.label, 'kind': dim.kind,
            'applies_to': applies, 'filter_only': dim.filter_only,
        }
        if dim.kind == DimensionKind.DATA:
            entry['items'] = _metric_items(metrics)
        else:
            entry['items'] = dim.items() if dim.items else []
        if dim.kind == DimensionKind.PERIOD:
            entry['period_types'] = [{'id': t, 'label': label} for t, label in PERIOD_TYPES]
        if dim.levels:
            entry['levels'] = [
                {'id': lv.id, 'label': lv.label,
                 'applies_to': [s for s in applies if s in lv.group_by]}
                for lv in dim.levels
            ]
        dimensions.append(entry)
    return {
        'groups': [{'id': g, 'label': GROUP_LABELS[g]} for g in visible_groups(role)],
        'sources': [
            {'id': s.id, 'label': s.label, 'grain': s.grain,
             'period_types': s.period.period_types}
            for s in sources
        ],
        'dimensions': dimensions,
    }

