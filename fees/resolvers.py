"""Pure resolution from fee *configuration* to the amount a given student
would be charged for a category in a period. No writes — the Phase 3
assignment engine calls these and snapshots the result onto an InvoiceLine.

Every resolver returns ``None`` when the category does not apply to the
student (not configured, or excluded — e.g. transport for a boarder).
"""

from decimal import Decimal

from students.level_groups import level_group

from .models import (
    ActivityFeePlan,
    LunchFeeConfig,
    TuitionFeePlan,
    UniformFeePlan,
)


def is_boarding(student, academic_year) -> bool:
    """A student is boarding iff they hold an active boarding placement for the
    year; everyone else is a day student (there is no flag on Student)."""
    return student.boarding_assignments.filter(
        academic_year=academic_year, is_active=True
    ).exists()


def resolve_tuition(student, academic_year) -> Decimal | None:
    base = TuitionFeePlan.objects.filter(
        academic_year=academic_year, is_active=True
    )
    row = base.filter(
        scope=TuitionFeePlan.Scope.LEVEL, level=student.level
    ).first()
    if row:
        return row.amount
    group = level_group(student.level)
    if group:
        row = base.filter(
            scope=TuitionFeePlan.Scope.LEVEL_GROUP, level_group=group
        ).first()
        if row:
            return row.amount
    return None


def resolve_uniform(student, academic_year) -> Decimal | None:
    """Standard uniform amount for the student's class. Whether a student is
    actually assigned uniform (and any per-student override) is decided by the
    assignment step, not here."""
    row = UniformFeePlan.objects.filter(
        academic_year=academic_year, is_active=True, level=student.level
    ).first()
    return row.amount if row else None


def resolve_lunch(student, academic_year, term, quarter) -> Decimal | None:
    cfg = LunchFeeConfig.objects.filter(
        academic_year=academic_year, term=term, quarter=quarter, is_active=True
    ).first()
    if not cfg:
        return None
    return cfg.amount_for(is_boarding(student, academic_year))


def resolve_activity(student, academic_year, term, quarter) -> Decimal | None:
    row = ActivityFeePlan.objects.filter(
        academic_year=academic_year, term=term, quarter=quarter,
        level=student.level, is_active=True,
    ).first()
    return row.amount if row else None


def resolve_transport(student, academic_year, term, quarter) -> Decimal | None:
    """Transport applies to day students with an active route subscription
    (decision J-6 / requirement 6). Boarders are always excluded."""
    if is_boarding(student, academic_year):
        return None
    assignment = student.transport_assignments.filter(
        academic_year=academic_year, is_active=True
    ).select_related('route').first()
    if not assignment:
        return None
    fee = assignment.route.fees.filter(
        academic_year=academic_year, term=term, quarter=quarter
    ).first()
    return fee.amount if fee else None
