"""Per-student fee roll-up used by the Student Fee Assignment screen, the
reminder SMS builder (Phase 6) and reports (Phase 7). Reads only FEE-kind
invoices (annual + quarterly) — uniform *sales* are deliberately excluded from
what a student "owes"."""

from decimal import Decimal

from .models import (
    FeeCategory,
    InvoiceKind,
    InvoiceLine,
    LineStatus,
    StudentCredit,
)

_CATEGORY_ORDER = [
    FeeCategory.TUITION, FeeCategory.LUNCH, FeeCategory.TRANSPORT,
    FeeCategory.UNIFORM, FeeCategory.ACTIVITY, FeeCategory.OTHER,
]


def _line_status(required: Decimal, paid: Decimal, all_waived: bool) -> str:
    if all_waived and paid <= 0:
        return LineStatus.WAIVED
    if paid <= 0:
        return LineStatus.UNPAID
    if paid >= required:
        return LineStatus.PAID
    return LineStatus.PARTIAL


def available_credit(student) -> Decimal:
    return sum(
        (c.remaining_amount for c in StudentCredit.objects.filter(
            student=student, remaining_amount__gt=0
        )),
        Decimal('0'),
    )


def student_fee_summary(student, academic_year) -> dict:
    lines = (
        InvoiceLine.objects
        .filter(
            invoice__student=student,
            invoice__academic_year=academic_year,
            invoice__kind__in=[InvoiceKind.ANNUAL, InvoiceKind.QUARTERLY],
        )
        .exclude(status=LineStatus.VOID)
        .select_related('invoice')
        .prefetch_related('adjustments')
    )

    buckets: dict[str, dict] = {}
    for ln in lines:
        b = buckets.setdefault(
            ln.category,
            {'required': Decimal('0'), 'paid': Decimal('0'),
             'outstanding': Decimal('0'), '_lines': 0, '_waived': 0},
        )
        b['required'] += ln.net_required
        b['paid'] += ln.amount_allocated
        b['outstanding'] += ln.outstanding
        b['_lines'] += 1
        if ln.status == LineStatus.WAIVED:
            b['_waived'] += 1

    categories = []
    tot_req = tot_paid = tot_out = Decimal('0')
    for cat in _CATEGORY_ORDER:
        if cat not in buckets:
            continue
        b = buckets[cat]
        tot_req += b['required']
        tot_paid += b['paid']
        tot_out += b['outstanding']
        categories.append({
            'category': cat,
            'category_display': FeeCategory(cat).label,
            'required': str(b['required']),
            'paid': str(b['paid']),
            'outstanding': str(b['outstanding']),
            'status': _line_status(
                b['required'], b['paid'], b['_waived'] == b['_lines']
            ),
        })

    credit = available_credit(student)

    return {
        'student': student.pk,
        'student_name': student.full_name,
        'student_id_display': student.student_id,
        'academic_year': academic_year.year,
        'categories': categories,
        'totals': {
            'required': str(tot_req),
            'paid': str(tot_paid),
            'outstanding': str(tot_out),
        },
        'available_credit': str(credit),
        'net_outstanding': str(max(tot_out - credit, Decimal('0'))),
    }
