"""Fee-ledger operations that must stay transactional and keep the derived
columns / invariants intact. Import these rather than creating
``PaymentAllocation`` / ``StudentCredit`` rows by hand."""

from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import (
    FeeCategory,
    InvoiceLine,
    LineStatus,
    Payment,
    PaymentAllocation,
    PaymentStatus,
    StudentCredit,
    recompute_invoice,
)

# Categories are consumed oldest-first within an invoice, but tuition is
# always filled before the rest so a short payment lands where schools expect.
_AUTO_PRIORITY = {FeeCategory.TUITION: 0}


def _dec(value) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


@transaction.atomic
def allocate_payment(payment: Payment, allocations) -> list[PaymentAllocation]:
    """``allocations``: iterable of ``(InvoiceLine, amount)``.

    Enforces (decision J-7): every target line belongs to the payment's
    student, no line is taken beyond its outstanding balance, and the
    allocations sum exactly to ``payment.amount``.
    """
    created: list[PaymentAllocation] = []
    total = Decimal('0')

    for line, raw_amount in allocations:
        amount = _dec(raw_amount)
        if amount <= 0:
            continue
        if line.status == LineStatus.VOID:
            raise ValidationError(f'{line.get_category_display()} charge is void.')
        if payment.student_id and line.invoice.student_id != payment.student_id:
            raise ValidationError('A payment cannot be allocated to another student’s charge.')
        outstanding = line.outstanding
        if amount > outstanding:
            raise ValidationError(
                f'{line.get_category_display()}: {amount} exceeds the outstanding '
                f'balance of {outstanding}.'
            )
        created.append(
            PaymentAllocation.objects.create(
                payment=payment, invoice_line=line, amount=amount
            )
        )
        total += amount

    if total != payment.amount:
        raise ValidationError(
            f'Allocations total {total}, which does not equal the payment amount '
            f'{payment.amount}.'
        )
    return created


@transaction.atomic
def auto_allocate(payment: Payment, invoice) -> list[PaymentAllocation]:
    """Back-compat path for the legacy single-invoice payment form: spread
    ``payment.amount`` across ``invoice``'s open lines (tuition first, then by
    age). Rejects anything above the invoice's total outstanding."""
    open_lines = list(invoice.lines.exclude(status=LineStatus.VOID))
    if not open_lines and (invoice.amount_due or 0) > 0:
        # Invoice created by amount only (legacy "create invoice by hand"
        # path) — synthesise the consolidated line the Phase 3 resolver will
        # later replace, so pay / receipt / balance still work end to end.
        already_paid = min(invoice.amount_paid or Decimal('0'), invoice.amount_due)
        open_lines = [InvoiceLine.objects.create(
            invoice=invoice,
            category=FeeCategory.TUITION,
            description='Consolidated term fees',
            level_snapshot=getattr(invoice.student, 'level', '') or '',
            amount=invoice.amount_due,
            amount_allocated=already_paid,
            source_kind='legacy_bridge',
        )]
    lines = sorted(
        open_lines,
        key=lambda ln: (_AUTO_PRIORITY.get(ln.category, 1), ln.pk),
    )
    remaining = payment.amount
    plan: list[tuple[InvoiceLine, Decimal]] = []
    for line in lines:
        if remaining <= 0:
            break
        take = min(remaining, line.outstanding)
        if take > 0:
            plan.append((line, take))
            remaining -= take
    if remaining > 0:
        raise ValidationError(
            'Payment exceeds the outstanding balance on this invoice.'
        )
    return allocate_payment(payment, plan)


@transaction.atomic
def reverse_payment(payment: Payment, user, reason: str) -> Payment:
    """Flag a payment REVERSED (its allocations stop counting) and record a
    linked audit row. Balances recompute via the Payment post_save signal."""
    if payment.status == PaymentStatus.REVERSED:
        raise ValidationError('This payment has already been reversed.')

    payment.status = PaymentStatus.REVERSED
    payment.reversed_by = user
    payment.reversed_at = timezone.now()
    payment.reversal_reason = reason
    payment.save(update_fields=['status', 'reversed_by', 'reversed_at', 'reversal_reason'])

    Payment.objects.create(
        student=payment.student,
        invoice=payment.invoice,
        amount=-payment.amount,
        payment_method=payment.payment_method,
        paid_at=timezone.now(),
        received_by=user,
        status=PaymentStatus.REVERSED,
        reversal_of=payment,
        reversal_reason=reason,
        notes=f'Reversal of {payment.receipt_number}',
    )
    return payment


@transaction.atomic
def void_line(line: InvoiceLine, user, reason: str) -> InvoiceLine:
    """Void a charge. Any money already allocated to it becomes carried credit
    for the student (decision J-6)."""
    if line.status == LineStatus.VOID:
        return line

    carried = line.amount_allocated
    line.status = LineStatus.VOID
    line.voided_by = user
    line.voided_at = timezone.now()
    line.void_reason = reason
    line.save(update_fields=['status', 'voided_by', 'voided_at', 'void_reason'])

    if carried > 0:
        StudentCredit.objects.create(
            student=line.invoice.student,
            amount=carried,
            remaining_amount=carried,
            source=StudentCredit.Source.VOID_LINE,
            source_line=line,
            reason=reason or 'Charge voided',
            created_by=user,
        )
    recompute_invoice(line.invoice)
    return line


@transaction.atomic
def apply_credit(credit: StudentCredit, payment: Payment) -> None:
    """Draw ``payment.amount`` down from ``credit``. The payment must already
    have ``payment_method = CARRIED_CREDIT`` and ``funded_from_credit = credit``
    and be allocated. Call after ``allocate_payment``."""
    if payment.funded_from_credit_id != credit.pk:
        raise ValidationError('Payment is not funded from this credit.')
    if payment.amount > credit.remaining_amount:
        raise ValidationError(
            f'Only {credit.remaining_amount} of credit remains.'
        )
    credit.remaining_amount -= payment.amount
    credit.save(update_fields=['remaining_amount'])
