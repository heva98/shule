"""
The aggregate query behind GET /api/analytics/query/, modelled on DHIS2's
/api/analytics:

    ?dimension=dx:exam.mean_score;exam.marks_count
    &dimension=pe:THIS_TERM;LAST_TERM
    &dimension=ou:FORM1;FORM2
    &filter=subject:MATH
    &filter=gender:F

`dimension` items become columns of the result rows; `filter` items only
restrict the facts. `dx` (metrics) must be a dimension and `pe` must be
given, as one or the other.

Every id is checked against the registry, as the caller's role and the
deployment's modules see it, before any fact is touched. An unknown or
module-disabled id is a 400, a metric outside the caller's role groups a
403 (ANALYTICS_PLAN.md §6.6).

Metrics defined on the same facts (same source, same fact queryset) are
evaluated together in one `.values(...).annotate(...)`. Each period, org
unit and dimension item becomes a SQL group key, so no fact row passes
through Python, and weighted averages are divided only after SUM and COUNT
were taken over the whole cell (D6). Items of one dimension can overlap (2026
and 2026T1, or OLEVEL and FORM1): a fact would belong to both cells, and a
shared cell can't be split back apart for a mean or a distinct count. So
overlapping items are grouped in separate queries, one per period type and
one per org-unit level.
"""
from __future__ import annotations

import datetime
import itertools
import logging
import operator
import time
from dataclasses import dataclass, field
from functools import reduce

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Case, CharField, F, Q, Value, When
from django.db.models.functions import Concat
from django.utils import timezone

from accounts.models import Role
from fees.models import AcademicYear
from staff.models import ClassTeacherAssignment

from .engine import evaluate_many
from .permissions import UNMASKED_ROLES
from .periods import (
    RELATIVE_PERIODS, Period, PeriodType, parse_period, period_date_range, period_label,
    resolve_periods,
)
from .registry import (
    DIMENSIONS, METRICS, SOURCES, FactSource, Metric, as_expression, org_unit_lookup,
    visible_dimensions, visible_metrics,
)

logger = logging.getLogger(__name__)

def _max_cells() -> int:
    return getattr(settings, 'ANALYTICS_MAX_CELLS', 10_000)


def _min_cell_size() -> int:
    return getattr(settings, 'ANALYTICS_MIN_CELL_SIZE', 5)


def _slow_query_ms() -> int:
    return getattr(settings, 'ANALYTICS_SLOW_QUERY_MS', 1_000)


class QueryError(Exception):
    def __init__(self, detail: str, status: int = 400, **extra):
        super().__init__(detail)
        self.status = status
        self.body = {'detail': detail, **extra}


# ── request parsing ────────────────────────────────────────────────────────

@dataclass
class Spec:
    id: str
    items: list[str]
    is_filter: bool


def parse_specs(params) -> list[Spec]:
    specs, seen = [], set()
    for param, is_filter in (('dimension', False), ('filter', True)):
        for raw in params.getlist(param):
            dim_id, _, items = raw.partition(':')
            dim_id = dim_id.strip()
            if not dim_id:
                raise QueryError(f'Empty {param} parameter.')
            if dim_id in seen:
                raise QueryError(f"Dimension '{dim_id}' is given more than once.")
            seen.add(dim_id)
            ids = list(dict.fromkeys(i.strip() for i in items.split(';') if i.strip()))
            specs.append(Spec(dim_id, ids, is_filter))
    return specs


# ── field helpers ──────────────────────────────────────────────────────────

def _field_at(model, path: str) -> models.Field:
    meta = model._meta
    parts = path.split('__')
    for part in parts[:-1]:
        meta = meta.get_field(part).related_model._meta
    return meta.get_field(parts[-1])


def _is_datetime(model, path: str) -> bool:
    return isinstance(_field_at(model, path), models.DateTimeField)


def _item_id(value) -> str:
    if isinstance(value, bool):
        return 'true' if value else 'false'
    return '' if value is None else str(value)


def _any(conditions) -> Q:
    return reduce(operator.or_, conditions, Q(pk__in=[]))


def _grouping(conditions: dict[str, Q]):
    """A SQL expression labelling each fact with the key of the condition it
    meets. The conditions of one call never overlap."""
    return Case(*[When(cond, then=Value(label)) for label, cond in conditions.items()],
                output_field=CharField())


@dataclass
class Variant:
    """One way to group (or filter) one axis in one query: the facts it
    keeps, the SQL key (None for a filter) and each key's result items."""
    condition: Q
    key: object = None
    items: dict[str, list[str]] = field(default_factory=dict)


# ── axes: one per dimension/filter other than dx ───────────────────────────

class Axis:
    dim_id: str
    label: str
    is_filter: bool
    item_ids: list[str]
    names: dict[str, str]

    def check(self, metric: Metric) -> None:
        """Raise QueryError if `metric` can't be broken down by this axis."""

    def prepare(self, qs, source: FactSource):
        return qs

    def variants(self, source: FactSource) -> list[Variant]:
        raise NotImplementedError

    def cell_count(self) -> int:
        return max(len(self.item_ids), 1)

    def _not_applicable(self, metric: Metric, what: str = None):
        verb = 'filtered' if self.is_filter else 'broken down'
        raise QueryError(
            f"Metric '{metric.id}' cannot be {verb} by {what or self.dim_id}.",
            code='dimension_not_applicable',
        )


class PeriodAxis(Axis):
    dim_id, label = 'pe', 'Period'

    def __init__(self, spec: Spec, warnings: list[str]):
        if not spec.items:
            raise QueryError('pe needs at least one period, e.g. pe:THIS_TERM.')
        try:
            resolution = resolve_periods(spec.items)
        except ValueError as exc:
            raise QueryError(str(exc), code='unknown_item') from None
        self.is_filter = spec.is_filter
        self.periods = [parse_period(pid) for pid in resolution.ids]
        self.item_ids = [p.id for p in self.periods]
        relative = {code: label for code, label, _ in RELATIVE_PERIODS}
        self.names = {p.id: period_label(p) for p in self.periods}
        self.names.update({c: relative[c] for c in spec.items if c in relative})
        self.warnings = warnings
        warnings.extend(w for w in resolution.warnings if w not in warnings)
        self._years = None

    def check(self, metric):
        binding = SOURCES[metric.source].period
        if binding.date is None and any(p.type == PeriodType.MONTH for p in self.periods):
            self._not_applicable(metric, 'month (it has academic periods only)')

    def _academic_years(self) -> dict[int, AcademicYear]:
        if self._years is None:
            years = {p.year for p in self.periods}
            self._years = {ay.year: ay for ay in AcademicYear.objects.filter(year__in=years)}
        return self._years

    def _warn(self, message):
        if message and message not in self.warnings:
            self.warnings.append(message)

    def condition(self, source: FactSource, period: Period) -> tuple[str, str, Q]:
        """(effective period type, key, condition) for `period` on `source`."""
        b = source.period
        if b.date:
            start, end, warning = period_date_range(period, self._academic_years().get(period.year))
            self._warn(warning)
            if _is_datetime(source_model(source), b.date):
                tz = timezone.get_current_timezone()
                start = datetime.datetime.combine(start, datetime.time.min, tzinfo=tz)
                end = datetime.datetime.combine(end, datetime.time.min, tzinfo=tz)
            return period.type, period.id, Q(**{f'{b.date}__gte': start, f'{b.date}__lt': end})
        year = Q(**{b.year: period.year})
        if period.type == PeriodType.TERM and b.term:
            return period.type, period.id, year & Q(**{b.term: period.term})
        if period.type == PeriodType.QUARTER and b.quarter:
            return period.type, period.id, year & Q(**{b.quarter: period.quarter})
        if period.type != PeriodType.YEAR:
            self._warn(f'{source.label} is recorded per academic year; '
                       f'term and quarter periods show the whole year.')
        return PeriodType.YEAR, str(period.year), year

    def variants(self, source):
        by_type: dict[str, tuple[dict, dict]] = {}
        for period in self.periods:
            ptype, key, cond = self.condition(source, period)
            conditions, items = by_type.setdefault(ptype, ({}, {}))
            conditions[key] = cond
            items.setdefault(key, []).append(period.id)
        if self.is_filter:
            return [Variant(_any(c for conds, _ in by_type.values() for c in conds.values()))]
        return [
            Variant(_any(conds.values()), _grouping(conds), items)
            for conds, items in by_type.values()
        ]


def source_model(source: FactSource):
    # Every metric of a source is defined on the same model.
    return next(m for m in METRICS.values() if m.source == source.id).queryset().model


class OrgUnitAxis(Axis):
    dim_id, label = 'ou', 'Org unit'

    def __init__(self, spec: Spec, index: int):
        if not spec.items:
            raise QueryError('ou needs at least one org unit, e.g. ou:FORM1.')
        units = org_unit_lookup()
        self.is_filter = spec.is_filter
        self.item_ids = list(dict.fromkeys(i.upper() for i in spec.items))
        unknown = [i for i in self.item_ids if i not in units]
        if unknown:
            raise QueryError(f"Unknown org unit: {', '.join(unknown)}.", code='unknown_item')
        self.units = {i: units[i] for i in self.item_ids}
        self.names = {i: u['label'] for i, u in self.units.items()}
        self.levels = {u['level'] for u in self.units.values()}
        self.alias = f'ou{index}'

    def _needed(self) -> set[str]:
        """The ou group-by levels this query's units match on; a stream is
        matched on its level and its stream."""
        needed = self.levels - {'school'}
        if 'stream' in needed:
            needed.add('level')
        return needed

    def _refs(self, source_id) -> dict[str, object]:
        ou = DIMENSIONS['ou']
        return {lv.id: ou.field_for(source_id, lv.id) for lv in ou.levels
                if lv.id in self._needed() and source_id in lv.group_by}

    def check(self, metric):
        missing = self._needed() - set(self._refs(metric.source))
        if missing:
            self._not_applicable(metric, ' or '.join(sorted(missing)).replace('_', ' '))

    def prepare(self, qs, source):
        """One alias per tree level whose SQL value *is* the org-unit id
        ('OLEVEL', 'FORM1', 'FORM1/A'). Grouping and filtering on that one
        expression evaluates it once per fact. A CASE branch per unit would
        repeat it, and the pre-P1 stream fallback is a correlated subquery
        (docs/analytics/QUERY_PERF.md)."""
        refs = {lv: as_expression(ref) for lv, ref in self._refs(source.id).items()}
        if 'stream' in refs:
            refs['stream'] = Concat(refs['level'], Value('/'), refs['stream'],
                                    output_field=CharField())
        return qs.alias(**{f'{self.alias}_{lv}': expr for lv, expr in refs.items()})

    def _by_level(self) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {}
        for unit_id, unit in self.units.items():
            out.setdefault(unit['level'], []).append(unit_id)
        return out

    def _condition(self, level: str, ids: list[str]) -> Q:
        cond = Q(**{f'{self.alias}_{level}__in': ids})
        if level == 'stream':
            # The plain level column first, so the stream expression is only
            # evaluated for the requested classes.
            classes = sorted({i.split('/')[0] for i in ids})
            cond = Q(**{f'{self.alias}_level__in': classes}) & cond
        return cond

    def _group_condition(self, source, level: str, ids: list[str]) -> Q:
        """The facts a grouped variant keeps, in SQL, using plain columns only.

        Postgres evaluates an expression in WHERE and again in GROUP BY. For
        an org-unit expression (the pre-P1 stream fallback, the SMS class
        lookup) that is a correlated subquery run twice per fact. So a
        grouped variant filters only on plain columns, and `AnalyticsQuery.run`
        drops the groups nobody asked for. That is exact: each group is
        aggregated on its own (docs/analytics/QUERY_PERF.md)."""
        refs = self._refs(source.id)
        level_is_column = isinstance(refs.get('level'), str)
        if level == 'stream':
            classes = sorted({i.split('/')[0] for i in ids})
            cond = Q(**{f'{self.alias}_level__in': classes}) if level_is_column else Q()
            if level_is_column and isinstance(refs.get('stream'), str):
                cond &= Q(**{f'{self.alias}_stream__in': ids})
            return cond
        return Q(**{f'{self.alias}_{level}__in': ids}) if level_is_column else Q()

    def variants(self, source):
        by_level = self._by_level()
        if self.is_filter:
            if 'school' in by_level:
                return [Variant(Q())]
            return [Variant(_any(self._condition(lv, ids) for lv, ids in by_level.items()))]
        out = []
        for level in ('school', 'level_group', 'level', 'stream'):
            ids = by_level.get(level)
            if not ids:
                continue
            if level == 'school':
                out.append(Variant(Q(), Value('SCHOOL', output_field=CharField()),
                                   {'SCHOOL': ['SCHOOL']}))
            else:
                alias = f'{self.alias}_{level}'
                out.append(Variant(self._group_condition(source, level, ids), F(alias),
                                   {i: [i] for i in ids}))
        return out


class DynamicAxis(Axis):
    def __init__(self, spec: Spec, dim, index: int):
        self.dim_id, self.label, self.dim = dim.id, dim.label, dim
        self.is_filter = spec.is_filter
        if dim.filter_only and not spec.is_filter:
            raise QueryError(f"'{dim.id}' can only be used as a filter.")
        known = {i['id']: i['label'] for i in dim.items()} if dim.items else None
        if known is not None:
            unknown = [i for i in spec.items if i not in known]
            if unknown:
                raise QueryError(f"Unknown {dim.id} item: {', '.join(unknown)}.",
                                 code='unknown_item')
        elif spec.is_filter and not spec.items:
            raise QueryError(f"Filter '{dim.id}' needs at least one item.")
        self.item_ids = list(spec.items)
        self.all_items = known or {}
        self.names = {i: self.all_items.get(i, i) for i in self.item_ids}
        self.alias = f'd{index}'

    def cell_count(self):
        return len(self.item_ids) or len(self.all_items) or 1

    def check(self, metric):
        if metric.source not in self.dim.group_by:
            self._not_applicable(metric)

    def prepare(self, qs, source):
        return qs.alias(**{self.alias: as_expression(self.dim.field_for(source.id))})

    def _db_values(self, source):
        ref = self.dim.field_for(source.id)
        if not isinstance(ref, str):
            return self.item_ids
        fld = _field_at(source_model(source), ref)
        try:
            return [fld.to_python(i) for i in self.item_ids]
        except ValidationError:
            raise QueryError(f"Invalid {self.dim_id} item.", code='unknown_item') from None

    def variants(self, source):
        cond = Q(**{f'{self.alias}__in': self._db_values(source)}) if self.item_ids else Q()
        if self.is_filter:
            return [Variant(cond)]
        return [Variant(cond, F(self.alias))]


class ClassScope(Axis):
    """A CLASS_TEACHER sees only the classes they are assigned, each in the
    year of the assignment (§6.6). Applied as a filter no caller can drop."""
    dim_id, is_filter, item_ids = 'class_scope', True, []

    def __init__(self, user, periods: PeriodAxis):
        self.assignments = list(
            ClassTeacherAssignment.objects
            .filter(teacher__user=user, is_active=True)
            .values_list('academic_year__year', 'level', 'stream')
        )
        self.periods = periods

    def check(self, metric):
        ou = DIMENSIONS['ou']
        for lv in ('level', 'stream'):
            if metric.source not in next(x for x in ou.levels if x.id == lv).group_by:
                raise QueryError(
                    f"Metric '{metric.id}' is not available at class level.", status=403)

    def prepare(self, qs, source):
        ou = DIMENSIONS['ou']
        return qs.alias(scope_level=as_expression(ou.field_for(source.id, 'level')),
                        scope_stream=as_expression(ou.field_for(source.id, 'stream')))

    def variants(self, source):
        conds = [
            self.periods.condition(source, parse_period(str(year)))[2]
            & Q(scope_level=level, scope_stream=stream)
            for year, level, stream in self.assignments
        ]
        return [Variant(_any(conds))]


# ── the query ──────────────────────────────────────────────────────────────

class AnalyticsQuery:
    def __init__(self, params, user):
        self.user = user
        self.warnings: list[str] = []
        self.specs = parse_specs(params)
        specs = {s.id: s for s in self.specs}

        dx = specs.get('dx')
        if dx is None or dx.is_filter:
            raise QueryError('dx must be given as a dimension, e.g. dimension=dx:exam.mean_score.')
        if not dx.items:
            raise QueryError('dx needs at least one metric.')
        self.metrics = self._metrics(dx.items)

        if 'pe' not in specs:
            raise QueryError('A period is required: add dimension=pe:… or filter=pe:….')

        visible = {d.id: d for d, _ in visible_dimensions(user.role)}
        self.axes: list[Axis] = []
        for i, spec in enumerate(self.specs):
            if spec.id == 'dx':
                continue
            if spec.id == 'pe':
                self.periods = PeriodAxis(spec, self.warnings)
                self.axes.append(self.periods)
            elif spec.id == 'ou':
                self.axes.append(OrgUnitAxis(spec, i))
            elif spec.id in visible:
                self.axes.append(DynamicAxis(spec, visible[spec.id], i))
            else:
                raise QueryError(f"Unknown dimension '{spec.id}'.", code='unknown_dimension')
        if user.role == Role.CLASS_TEACHER:
            self.axes.append(ClassScope(user, self.periods))

        for metric in self.metrics:
            for axis in self.axes:
                axis.check(metric)

        self.cells = len(self.metrics)
        for axis in self.axes:
            if not axis.is_filter:
                self.cells *= axis.cell_count()
        if self.cells > _max_cells():
            raise QueryError(
                f'This query could return up to {self.cells:,} values; the limit is '
                f'{_max_cells():,}. Use fewer items or move a dimension to a filter.',
                code='too_many_cells', cells=self.cells, max_cells=_max_cells(),
            )
        self.mask = user.role not in UNMASKED_ROLES
        self.queries = 0

    def _metrics(self, ids) -> list[Metric]:
        enabled = {m.id for m in visible_metrics()}
        unknown = [i for i in ids if i not in enabled]
        if unknown:
            # A metric of a disabled module doesn't exist here (§6.5).
            raise QueryError(f"Unknown data item: {', '.join(unknown)}.", code='unknown_item')
        allowed = {m.id for m in visible_metrics(self.user.role)}
        denied = [i for i in ids if i not in allowed]
        if denied:
            raise QueryError(f"You may not view: {', '.join(denied)}.", status=403)
        return [METRICS[i] for i in ids]

    @property
    def grouped_axes(self) -> list[Axis]:
        return [a for a in self.axes if not a.is_filter]

    def _fact_sets(self):
        """Metrics grouped by the facts they're computed from, in dx order."""
        sets: dict[tuple, list[Metric]] = {}
        for metric in self.metrics:
            sets.setdefault((metric.source, metric.queryset), []).append(metric)
        return sets.items()

    def run(self) -> list[tuple[dict[str, str], Metric, object, bool]]:
        """(item per axis, metric, value, suppressed) for every non-empty cell."""
        out = []
        for (source_id, queryset), metrics in self._fact_sets():
            source = SOURCES[source_id]
            qs = queryset()
            for axis in self.axes:
                qs = axis.prepare(qs, source)
            pupils = None
            if self.mask and any(m.masked for m in metrics):
                pupils = source.student or 'pk'
            for combo in itertools.product(*(a.variants(source) for a in self.axes)):
                facts = qs.filter(*(v.condition for v in combo))
                grouped = [(a, v) for a, v in zip(self.axes, combo) if not a.is_filter]
                rows = evaluate_many(metrics, facts, group_by=[v.key for _, v in grouped],
                                     pupils=pupils)
                self.queries += 1
                for row in rows:
                    if any(v.items and key not in v.items for (_, v), key in zip(grouped, row.keys)):
                        continue  # an org unit that wasn't asked for (_group_condition)
                    fans = [
                        [(a.dim_id, item) for item in (v.items.get(key) if v.items else [_item_id(key)])]
                        for (a, v), key in zip(grouped, row.keys)
                    ]
                    for items in itertools.product(*fans):
                        for metric, cell in zip(metrics, row.cells):
                            suppressed = (pupils is not None and metric.masked
                                          and row.pupils < _min_cell_size())
                            value = None if suppressed else cell.value
                            if value is None and not suppressed:
                                continue
                            out.append((dict(items), metric, value, suppressed))
        return out


def _format(metric: Metric, value):
    if value is None:
        return None
    if metric.unit == 'count' and value == int(value):
        return int(value)
    return round(float(value), 2)


def run_query(params, user) -> dict:
    started = time.perf_counter()
    query = AnalyticsQuery(params, user)
    cells = query.run()

    columns = [s.id for s in query.specs if not s.is_filter]
    axes = {a.dim_id: a for a in query.axes}
    dimensions = {'dx': [m.id for m in query.metrics]}
    for axis in query.axes:
        if axis.dim_id == 'class_scope':
            continue
        if axis.item_ids:
            dimensions[axis.dim_id] = axis.item_ids
        else:
            seen = {items[axis.dim_id] for items, *_ in cells}
            dimensions[axis.dim_id] = sorted(seen)
    order = {d: {item: i for i, item in enumerate(ids)} for d, ids in dimensions.items()}

    rows = []
    for items, metric, value, suppressed in cells:
        items = {**items, 'dx': metric.id}
        rows.append([items[c] for c in columns] + [_format(metric, value), suppressed])
    rows.sort(key=lambda r: [order[c].get(r[i], len(order[c])) for i, c in enumerate(columns)])

    # Item names are keyed by dimension. Unlike DHIS2's UIDs, item ids here
    # are only unique within a dimension (grade F and gender F), so one flat
    # map would let one dimension's name overwrite another's.
    items = {'dx': {'name': 'Data', 'items': {
        m.id: {'name': m.label, 'unit': m.unit} for m in query.metrics
    }}}
    for axis in query.axes:
        if axis.dim_id == 'class_scope':
            continue
        names = {i: {'name': n} for i, n in axis.names.items()}
        for item in dimensions[axis.dim_id]:
            if item not in names:
                label = getattr(axis, 'all_items', {}).get(item) or item or '(blank)'
                names[item] = {'name': label}
        items[axis.dim_id] = {'name': axis.label, 'items': names}

    headers = [
        {'name': c, 'column': 'Data' if c == 'dx' else axes[c].label,
         'valueType': 'TEXT', 'meta': True}
        for c in columns
    ] + [
        {'name': 'value', 'column': 'Value', 'valueType': 'NUMBER', 'meta': False},
        {'name': 'suppressed', 'column': 'Suppressed', 'valueType': 'BOOLEAN', 'meta': False},
    ]
    elapsed_ms = (time.perf_counter() - started) * 1000
    log = logger.warning if elapsed_ms > _slow_query_ms() else logger.info
    log(
        'analytics query user=%s role=%s dx=%s dimensions=%s filters=%s '
        'sql_queries=%d rows=%d time_ms=%.1f',
        user.pk, user.role, ';'.join(dimensions['dx']),
        [s.id for s in query.specs if not s.is_filter and s.id != 'dx'],
        [s.id for s in query.specs if s.is_filter],
        query.queries, len(rows), elapsed_ms,
    )
    return {
        'headers': headers,
        'metaData': {'items': items, 'dimensions': dimensions, 'warnings': query.warnings},
        'rows': rows,
        'height': len(rows),
        'width': len(headers),
    }
