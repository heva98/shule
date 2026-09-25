"""
The pupils behind one cell of an analytics query
(GET /api/analytics/drilldown/). This is the only analytics endpoint that
returns individual pupils; the aggregate query never does.

The request is the aggregate query's, narrowed to one cell: exactly one
metric (`dimension=dx:<metric>`), and every other dimension given as a
`filter`, with the cell's item for the dimensions the pivot laid out plus
the query's own filters:

    ?dimension=dx:exam.mean_score
    &filter=pe:2026T1
    &filter=ou:FORM1/A
    &filter=gender:F

It goes through the same validation as the aggregate query (registry,
modules, role groups, and the class teacher's forced class scope), then:

* a role that sees masked score cells (D18) may not list pupils for a
  masked metric (`permissions.can_drill_down`);
* the metric is evaluated per pupil, in SQL, over the cell's facts, so each
  pupil's value is computed the same way as the cell's (a mean is still
  Σ score / Σ marks, over that pupil's marks in the cell).
"""
from __future__ import annotations

from django.conf import settings
from django.db.models import F

from students.models import Student

from .engine import evaluate_many
from .permissions import can_drill_down
from .query import AnalyticsQuery, QueryError, _format
from .registry import SOURCES


def _max_rows() -> int:
    return getattr(settings, 'ANALYTICS_DRILLDOWN_MAX_ROWS', 1_000)


def _name(first, middle, last) -> str:
    return ' '.join(p for p in (first, middle, last) if p)


def run_drilldown(params, user) -> dict:
    query = AnalyticsQuery(params, user)
    if len(query.metrics) != 1:
        raise QueryError('A drill-down takes exactly one metric.')
    if query.grouped_axes:
        raise QueryError(
            'Give the cell as filters: only dx may be a dimension in a drill-down.',
            code='not_a_cell',
        )
    metric = query.metrics[0]
    if not can_drill_down(metric, user.role):
        raise QueryError(f"You may not list the pupils behind '{metric.label}'.", status=403)

    source = SOURCES[metric.source]
    student = source.student or 'pk'
    qs = metric.queryset()
    for axis in query.axes:
        qs = axis.prepare(qs, source)
    # Every axis is a filter here, so each has exactly one variant. SMS to a
    # number with no pupil attached has no pupil to list.
    facts = qs.filter(
        *(axis.variants(source)[0].condition for axis in query.axes),
        **{f'{student}__isnull': False},
    )
    rows = evaluate_many([metric], facts, group_by=[F(student)])
    values = {row.keys[0]: row.cells[0].value for row in rows}

    pupils = [
        {
            'public_id': str(s['public_id']),
            'name': _name(s['first_name'], s['middle_name'], s['last_name']),
            'admission_no': s['student_id'],
            'gender': s['gender'],
            'level': s['level'],
            'stream': s['stream'],
            'value': _format(metric, values[s['pk']]),
        }
        for s in Student.objects.filter(pk__in=values).values(
            'pk', 'public_id', 'first_name', 'middle_name', 'last_name', 'student_id',
            'gender', 'level', 'stream',
        )
    ]
    # Highest value first (largest arrears, best mean…), pupils without a
    # value last, then by name.
    pupils.sort(key=lambda p: (p['value'] is None, -(p['value'] or 0), p['name']))
    limit = _max_rows()
    return {
        'metric': {'id': metric.id, 'name': metric.label, 'unit': metric.unit},
        'total': len(pupils),
        'truncated': len(pupils) > limit,
        'pupils': pupils[:limit],
        'warnings': query.warnings,
    }
