"""The assignment engine: turn fee *configuration* into a student's concrete
charges (:class:`InvoiceLine`), idempotently.

Rules it enforces (edge cases 1-7, 15-20):
  * Re-running never duplicates a charge — one line per (invoice, category).
  * An engine-owned line that is still unpaid and un-adjusted is refreshed to
    the current configured amount (handles "fee changed before anyone paid").
  * If a category stops applying (boarder gains transport line, plan removed,
    class change drops an activity fee) the unpaid engine-owned line is voided.
  * Legacy lines, manually-created lines, and anything with money or an
    adjustment on it are never touched — only reported as skipped.
Uniform is opt-in: the engine only *refreshes / voids* uniform lines, it never
creates them. Use :func:`assign_uniform` for that.
"""

from datetime import date
from decimal import Decimal

from django.db import transaction

from students.models import Student, StudentStatus

from . import resolvers
from .models import (
    AcademicYear,
    FeeCategory,
    Invoice,
    InvoiceKind,
    InvoiceLine,
    LineStatus,
)
from .services import void_line

ANNUAL_CATEGORIES = (FeeCategory.TUITION,)
QUARTERLY_CATEGORIES = (FeeCategory.LUNCH, FeeCategory.TRANSPORT, FeeCategory.ACTIVITY)

SOURCE_KIND = {
    FeeCategory.TUITION: 'tuition_plan',
    FeeCategory.LUNCH: 'lunch_config',
    FeeCategory.TRANSPORT: 'route_fee',
    FeeCategory.ACTIVITY: 'activity_plan',
    FeeCategory.UNIFORM: 'uniform_plan',
}
# source_kinds the engine may refresh/void on its own
ENGINE_OWNED = set(SOURCE_KIND.values())


def blank_stats() -> dict:
    return {
        'created': 0, 'updated': 0, 'voided': 0,
        'skipped': 0, 'skipped_paid': 0, '_students': set(),
    }


def finalize(stats: dict) -> dict:
    stats = dict(stats)
    stats['students'] = len(stats.pop('_students'))
    return stats


def default_due_date(year: AcademicYear, kind: str, quarter: str | None) -> date:
    if kind == InvoiceKind.QUARTERLY and quarter:
        d = getattr(year, f'{quarter.lower()}_end', None)
        if d:
            return d
    return getattr(year, 'q4_end', None) or date(year.year, 12, 1)


def _resolve(category, student, year, term, quarter) -> Decimal | None:
    if category == FeeCategory.TUITION:
        return resolvers.resolve_tuition(student, year)
    if category == FeeCategory.LUNCH:
        return resolvers.resolve_lunch(student, year, term, quarter)
    if category == FeeCategory.TRANSPORT:
        return resolvers.resolve_transport(student, year, term, quarter)
    if category == FeeCategory.ACTIVITY:
        return resolvers.resolve_activity(student, year, term, quarter)
    return None


def _existing_line(invoice, category):
    return (
        invoice.lines.exclude(status=LineStatus.VOID)
        .filter(category=category)
        .first()
    )


def _touchable(line) -> bool:
    """True when the engine is allowed to rewrite or void this line."""
    return (
        line.source_kind in ENGINE_OWNED
        and not line.is_legacy
        and line.amount_allocated == 0
        and not line.adjustments.exists()
    )


def _apply_line(invoice, category, amount, student, created_by, stats):
    existing = _existing_line(invoice, category)

    if amount is None:
        if existing and _touchable(existing):
            void_line(existing, created_by, f'{category} no longer applies')
            stats['voided'] += 1
        elif existing:
            stats['skipped'] += 1
        return

    if existing:
        if not _touchable(existing):
            stats['skipped_paid' if existing.amount_allocated else 'skipped'] += 1
            return
        if existing.amount != amount or existing.level_snapshot != student.level:
            existing.amount = amount
            existing.level_snapshot = student.level
            existing.save(update_fields=['amount', 'level_snapshot'])
            stats['updated'] += 1
        return

    InvoiceLine.objects.create(
        invoice=invoice,
        category=category,
        amount=amount,
        level_snapshot=student.level,
        description=FeeCategory(category).label,
        source_kind=SOURCE_KIND[category],
        created_by=created_by,
    )
    stats['created'] += 1


def _get_invoice(student, year, kind, term, quarter, due_date, *, create):
    lookup = dict(student=student, academic_year=year, kind=kind)
    if kind == InvoiceKind.QUARTERLY:
        lookup.update(term=term, quarter=quarter)
    inv = Invoice.objects.filter(**lookup).first()
    if inv or not create:
        return inv
    return Invoice.objects.create(
        **lookup,
        due_date=due_date or default_due_date(year, kind, quarter),
    )


def _refresh_uniform(invoice, student, year, created_by, stats):
    line = (
        invoice.lines.exclude(status=LineStatus.VOID)
        .filter(category=FeeCategory.UNIFORM, source_kind='uniform_plan')
        .first()
    )
    if not line or not _touchable(line):
        return
    amount = resolvers.resolve_uniform(student, year)
    if amount is not None and line.amount != amount:
        line.amount = amount
        line.save(update_fields=['amount'])
        stats['updated'] += 1


@transaction.atomic
def generate_for_student(student, year, *, scope, term=None, quarter=None,
                         due_date=None, created_by=None, stats=None):
    stats = stats if stats is not None else blank_stats()

    if scope == InvoiceKind.ANNUAL:
        categories = ANNUAL_CATEGORIES
        resolved = {c: _resolve(c, student, year, None, None) for c in categories}
    else:
        if not term or not quarter:
            raise ValueError('Quarterly generation needs term and quarter.')
        categories = QUARTERLY_CATEGORIES
        resolved = {c: _resolve(c, student, year, term, quarter) for c in categories}

    invoice = _get_invoice(
        student, year, scope, term, quarter, due_date,
        create=any(v is not None for v in resolved.values()),
    )
    if invoice is None:
        return stats

    for category in categories:
        _apply_line(invoice, category, resolved[category], student, created_by, stats)
    if scope == InvoiceKind.ANNUAL:
        _refresh_uniform(invoice, student, year, created_by, stats)

    stats['_students'].add(student.pk)
    return stats


def generate_charges(year, scope, *, term=None, quarter=None, levels=None,
                     students=None, due_date=None, created_by=None) -> dict:
    stats = blank_stats()
    qs = students if students is not None else Student.objects.filter(
        status=StudentStatus.ACTIVE
    )
    if levels:
        qs = qs.filter(level__in=list(levels))
    for student in qs:
        generate_for_student(
            student, year, scope=scope, term=term, quarter=quarter,
            due_date=due_date, created_by=created_by, stats=stats,
        )
    return finalize(stats)


@transaction.atomic
def assign_uniform(year, students, *, amount_override=None, created_by=None) -> dict:
    """Opt a set of students into the uniform charge for the year. With
    ``amount_override`` the line is marked ``uniform_manual`` so the engine
    leaves its amount alone thereafter (decision: per-student override)."""
    stats = blank_stats()
    src = 'uniform_manual' if amount_override is not None else 'uniform_plan'

    for student in students:
        invoice = _get_invoice(
            student, year, InvoiceKind.ANNUAL, None, None, None, create=True
        )
        line = _existing_line(invoice, FeeCategory.UNIFORM)
        amount = (
            amount_override if amount_override is not None
            else resolvers.resolve_uniform(student, year)
        )
        if amount is None:
            stats['skipped'] += 1
            continue
        if line:
            if line.amount_allocated > 0 or line.adjustments.exists():
                stats['skipped_paid'] += 1
                continue
            line.amount = amount
            line.source_kind = src
            line.level_snapshot = student.level
            line.save(update_fields=['amount', 'source_kind', 'level_snapshot'])
            stats['updated'] += 1
        else:
            InvoiceLine.objects.create(
                invoice=invoice, category=FeeCategory.UNIFORM, amount=amount,
                level_snapshot=student.level, description='Uniform',
                source_kind=src, created_by=created_by,
            )
            stats['created'] += 1
        stats['_students'].add(student.pk)

    return finalize(stats)
