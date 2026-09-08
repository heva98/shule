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


def _ordered(pairs: dict[str, Decimal]) -> list[tuple[str, Decimal]]:
    out = []
    for cat in _CATEGORY_ORDER:
        if pairs.get(cat, Decimal('0')) != 0:
            out.append((cat, pairs[cat]))
    return out


def payment_category_breakdown(payment) -> list[tuple[str, Decimal]]:
    """[(FeeCategory, amount)] for an ACTIVE payment's allocations, category
    order fixed. Used by the payment-confirmation SMS / receipt."""
    sums: dict[str, Decimal] = {}
    for alloc in payment.allocations.select_related('invoice_line'):
        cat = alloc.invoice_line.category
        sums[cat] = sums.get(cat, Decimal('0')) + alloc.amount
    return _ordered(sums)


def outstanding_breakdown(student, academic_year=None) -> list[tuple[str, Decimal]]:
    """[(FeeCategory, outstanding)] across the student's FEE-kind charges
    (optionally one year), categories with nothing outstanding omitted. Used by
    the fee-reminder SMS."""
    qs = (
        InvoiceLine.objects
        .filter(
            invoice__student=student,
            invoice__kind__in=[InvoiceKind.ANNUAL, InvoiceKind.QUARTERLY],
        )
        .exclude(status__in=[LineStatus.VOID, LineStatus.PAID, LineStatus.WAIVED])
        .select_related('invoice')
        .prefetch_related('adjustments')
    )
    if academic_year is not None:
        qs = qs.filter(invoice__academic_year=academic_year)

    sums: dict[str, Decimal] = {}
    for ln in qs:
        if ln.outstanding > 0:
            sums[ln.category] = sums.get(ln.category, Decimal('0')) + ln.outstanding
    return _ordered(sums)


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
