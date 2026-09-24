"""
Evaluates a registry metric over its facts, optionally grouped.

Numerator and denominator are aggregated in SQL at fact grain for every
output cell, then divided here, once. A total is a fresh query with no
grouping, never a combination of the cells' values, so weighted averages
and distribution metrics (median, stddev…) stay correct at every level.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Sequence

from django.db.models import Q

from .registry import FieldRef, Metric, as_expression


@dataclass(frozen=True)
class Cell:
    keys: tuple
    numerator: object
    denominator: object
    value: Decimal | None


def evaluate(metric: Metric, *, group_by: Sequence[FieldRef] = (),
             filters: Q | None = None) -> list[Cell]:
    """One Cell per combination of `group_by` values (one Cell with empty
    keys when ungrouped). `group_by` entries come from `Dimension.field_for`."""
    qs = metric.queryset()
    if filters is not None:
        qs = qs.filter(filters)

    aggregates = {'num': metric.numerator()}
    if metric.denominator is not None:
        aggregates['den'] = metric.denominator()

    keys = [f'g{i}' for i in range(len(group_by))]
    if keys:
        rows = (
            qs.annotate(**{k: as_expression(ref) for k, ref in zip(keys, group_by)})
            .values(*keys)
            .annotate(**aggregates)
            .order_by(*keys)
        )
    else:
        rows = [qs.aggregate(**aggregates)]

    return [
        Cell(
            keys=tuple(row[k] for k in keys),
            numerator=row['num'],
            denominator=row.get('den'),
            value=metric.compute(row['num'], row.get('den')),
        )
        for row in rows
    ]
