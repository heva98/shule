"""
Evaluates registry metrics over their facts, optionally grouped.

Numerator and denominator are aggregated in SQL at fact grain for every
output cell, then divided here, once. A total is a fresh query with no
grouping, never a combination of the cells' values, so weighted averages
and distribution metrics (median, stddev…) stay correct at every level.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Sequence

from django.db.models import Count, Expression, Q, QuerySet

from .registry import FieldRef, Metric, as_expression


@dataclass(frozen=True)
class Cell:
    keys: tuple
    numerator: object
    denominator: object
    value: Decimal | None


@dataclass(frozen=True)
class Row:
    """One group: a Cell per metric, in the order the metrics were given,
    plus the distinct pupils behind it when asked for (small-cell masking)."""
    keys: tuple
    cells: tuple[Cell, ...]
    pupils: int | None = None


def evaluate_many(metrics: Sequence[Metric], queryset: QuerySet, *,
                  group_by: Sequence[Expression] = (),
                  pupils: str | None = None) -> list[Row]:
    """Every metric in one `.values(...).annotate(...)` over `queryset`,
    which must be the facts all of `metrics` are defined on. `pupils` is the
    path to the student, to count distinct pupils per group.

    Groups with no facts produce no Row, grouped or not."""
    aggregates = {}
    for i, metric in enumerate(metrics):
        aggregates[f'num{i}'] = metric.numerator()
        if metric.denominator is not None:
            aggregates[f'den{i}'] = metric.denominator()
    if pupils is not None:
        aggregates['pupils'] = Count(pupils, distinct=True)

    keys = [f'g{i}' for i in range(len(group_by))]
    if keys:
        rows = (
            queryset.annotate(**dict(zip(keys, group_by)))
            .values(*keys)
            .annotate(**aggregates)
            .order_by(*keys)
        )
    else:
        row = queryset.aggregate(facts=Count('*'), **aggregates)
        rows = [row] if row['facts'] else []

    return [
        Row(
            keys=tuple(row[k] for k in keys),
            cells=tuple(
                Cell(
                    keys=tuple(row[k] for k in keys),
                    numerator=row[f'num{i}'],
                    denominator=row.get(f'den{i}'),
                    value=metric.compute(row[f'num{i}'], row.get(f'den{i}')),
                )
                for i, metric in enumerate(metrics)
            ),
            pupils=row.get('pupils'),
        )
        for row in rows
    ]


def evaluate(metric: Metric, *, group_by: Sequence[FieldRef] = (),
             filters: Q | None = None) -> list[Cell]:
    """One Cell per combination of `group_by` values (one Cell with empty
    keys when ungrouped). `group_by` entries come from `Dimension.field_for`."""
    qs = metric.queryset()
    if filters is not None:
        qs = qs.filter(filters)
    rows = evaluate_many([metric], qs, group_by=[as_expression(ref) for ref in group_by])
    return [row.cells[0] for row in rows]
