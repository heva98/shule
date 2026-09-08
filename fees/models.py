from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Sum
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.utils import timezone

from students.models import Level
from students.level_groups import LevelGroup
from shule.utils import validate_term_quarter


class Term(models.TextChoices):
    TERM1 = 'TERM1', 'Term 1'
    TERM2 = 'TERM2', 'Term 2'


class Quarter(models.TextChoices):
    Q1 = 'Q1', 'Quarter 1'
    Q2 = 'Q2', 'Quarter 2'
    Q3 = 'Q3', 'Quarter 3'
    Q4 = 'Q4', 'Quarter 4'


class InvoiceStatus(models.TextChoices):
    UNPAID = 'UNPAID', 'Unpaid'
    PARTIAL = 'PARTIAL', 'Partial'
    PAID = 'PAID', 'Paid'
    OVERDUE = 'OVERDUE', 'Overdue'


class PaymentMethod(models.TextChoices):
    MPESA = 'MPESA', 'M-Pesa'
    AIRTEL = 'AIRTEL', 'Airtel Money'
    CASH = 'CASH', 'Cash'
    BANK_TRANSFER = 'BANK_TRANSFER', 'Bank Transfer'
    # A previously-received payment converted to credit (from a voided charge
    # or a payment reversal) being applied to a student's outstanding fees.
    # No new cash changes hands, so it is excluded from cash-collection totals.
    CARRIED_CREDIT = 'CARRIED_CREDIT', 'Carried Credit'


class FeeCategory(models.TextChoices):
    """The independently-configured, -assigned, -paid and -reported fee sections.
    Fixed set by design (decision J-1); a lookup table can replace this later
    without touching the column."""
    TUITION = 'TUITION', 'Tuition'
    TRANSPORT = 'TRANSPORT', 'Transport'
    LUNCH = 'LUNCH', 'Lunch'
    UNIFORM = 'UNIFORM', 'Uniform'
    ACTIVITY = 'ACTIVITY', 'Activity'
    OTHER = 'OTHER', 'Other'


class InvoiceKind(models.TextChoices):
    ANNUAL = 'ANNUAL', 'Annual fees'          # tuition (+ annual uniform)
    QUARTERLY = 'QUARTERLY', 'Quarterly fees'  # lunch / transport / activity
    SALE = 'SALE', 'Sale'                      # uniform walk-in sales, itemised


class LineStatus(models.TextChoices):
    UNPAID = 'UNPAID', 'Unpaid'
    PARTIAL = 'PARTIAL', 'Partial'
    PAID = 'PAID', 'Paid'
    WAIVED = 'WAIVED', 'Waived'
    VOID = 'VOID', 'Void'


class PaymentStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Active'
    REVERSED = 'REVERSED', 'Reversed'


class AcademicYear(models.Model):
    year = models.IntegerField(unique=True)
    is_current = models.BooleanField(default=False)

    q1_start = models.DateField(null=True, blank=True)
    q1_end = models.DateField(null=True, blank=True)
    q2_start = models.DateField(null=True, blank=True)
    q2_end = models.DateField(null=True, blank=True)
    q3_start = models.DateField(null=True, blank=True)
    q3_end = models.DateField(null=True, blank=True)
    q4_start = models.DateField(null=True, blank=True)
    q4_end = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['-year']

    def __str__(self):
        return str(self.year)

    def save(self, *args, **kwargs):
        if self.is_current:
            AcademicYear.objects.exclude(pk=self.pk).update(is_current=False)
        super().save(*args, **kwargs)

    def get_term_for_quarter(self, quarter):
        """Return 'TERM1' or 'TERM2' for the given quarter string."""
        from shule.utils import TERM_QUARTER_MAP
        return TERM_QUARTER_MAP.get(quarter)


class SchoolCalendarEvent(models.Model):
    class EventType(models.TextChoices):
        HOLIDAY   = 'HOLIDAY',   'Public Holiday'
        EXAM      = 'EXAM',      'Examination'
        SPORTS    = 'SPORTS',    'Sports & Games'
        MEETING   = 'MEETING',   'Meeting'
        TRIP      = 'TRIP',      'School Trip'
        CEREMONY  = 'CEREMONY',  'Ceremony'
        OTHER     = 'OTHER',     'Other'

    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='events')
    title         = models.CharField(max_length=200)
    event_type    = models.CharField(max_length=20, choices=EventType.choices, default=EventType.OTHER)
    start_date    = models.DateField()
    end_date      = models.DateField(null=True, blank=True)
    description   = models.TextField(blank=True)
    created_by    = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='created_calendar_events',
    )
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['start_date']

    def __str__(self):
        return f'{self.title} ({self.start_date})'


# ── Fee configuration (templates) ────────────────────────────────────────────
# The school's rule for a fee — NOT what any given student owes. A student's
# charge is a resolved snapshot (InvoiceLine) produced from these in Phase 3.
# Transport config lives in the transport app (Route / RouteFee).

class TuitionFeePlan(models.Model):
    """Annual tuition (decision J-2). Configured for a whole level group
    (Primary / O-Level / …) or a single class; a class-scoped row overrides
    the group row for that class."""
    class Scope(models.TextChoices):
        LEVEL_GROUP = 'LEVEL_GROUP', 'Level group'
        LEVEL = 'LEVEL', 'Single class'

    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.PROTECT, related_name='tuition_plans'
    )
    scope = models.CharField(max_length=12, choices=Scope.choices)
    level_group = models.CharField(max_length=10, choices=LevelGroup.choices, blank=True)
    level = models.CharField(max_length=10, choices=Level.choices, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['academic_year', 'level_group', 'level']
        constraints = [
            models.UniqueConstraint(
                fields=['academic_year', 'level_group'],
                condition=models.Q(is_active=True, scope='LEVEL_GROUP'),
                name='uniq_active_tuition_plan_per_group',
            ),
            models.UniqueConstraint(
                fields=['academic_year', 'level'],
                condition=models.Q(is_active=True, scope='LEVEL'),
                name='uniq_active_tuition_plan_per_level',
            ),
            models.CheckConstraint(
                check=(
                    models.Q(scope='LEVEL_GROUP', level_group__gt='', level='')
                    | models.Q(scope='LEVEL', level__gt='')
                ),
                name='tuition_plan_scope_fields_consistent',
            ),
        ]

    def __str__(self):
        target = self.level or self.level_group
        return f'{self.academic_year} | Tuition {target} | {self.amount}'

    def clean(self):
        if self.scope == self.Scope.LEVEL_GROUP and not self.level_group:
            raise ValidationError({'level_group': 'Required for a level-group plan.'})
        if self.scope == self.Scope.LEVEL and not self.level:
            raise ValidationError({'level': 'Required for a single-class plan.'})


class UniformFeePlan(models.Model):
    """Standard annual uniform cost for a class (decision J-1 / uniform=annual).
    Assignment to individual students, and per-student overrides, happen at
    assignment time — configuring a plan does not charge anyone."""
    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.PROTECT, related_name='uniform_plans'
    )
    level = models.CharField(max_length=10, choices=Level.choices)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['academic_year', 'level']
        constraints = [
            models.UniqueConstraint(
                fields=['academic_year', 'level'],
                condition=models.Q(is_active=True),
                name='uniq_active_uniform_plan_per_level',
            ),
        ]

    def __str__(self):
        return f'{self.academic_year} | Uniform {self.level} | {self.amount}'


class LunchFeeConfig(models.Model):
    """School-wide lunch rates for a quarter (decision J-8). When a row exists
    for a period, lunch is charged to every active student at the rate for
    their boarding/day status; when none exists, no lunch is charged."""
    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.PROTECT, related_name='lunch_configs'
    )
    term = models.CharField(max_length=10, choices=Term.choices)
    quarter = models.CharField(max_length=5, choices=Quarter.choices)
    day_amount = models.DecimalField(max_digits=10, decimal_places=2)
    boarding_amount = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-academic_year__year', 'term', 'quarter']
        constraints = [
            models.UniqueConstraint(
                fields=['academic_year', 'term', 'quarter'],
                name='uniq_lunch_config_per_period',
            ),
        ]

    def __str__(self):
        return f'{self.academic_year} | Lunch {self.term} {self.quarter}'

    def clean(self):
        validate_term_quarter(self.term, self.quarter)

    def amount_for(self, is_boarding: bool):
        return self.boarding_amount if is_boarding else self.day_amount


class ActivityFeePlan(models.Model):
    """Per-class activity fee for a quarter (decision J-5). Applies to every
    student in the class for that period; the assignment engine keeps the
    roster in step as students join or leave."""
    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.PROTECT, related_name='activity_plans'
    )
    term = models.CharField(max_length=10, choices=Term.choices)
    quarter = models.CharField(max_length=5, choices=Quarter.choices)
    level = models.CharField(max_length=10, choices=Level.choices)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-academic_year__year', 'term', 'quarter', 'level']
        constraints = [
            models.UniqueConstraint(
                fields=['academic_year', 'term', 'quarter', 'level'],
                condition=models.Q(is_active=True),
                name='uniq_active_activity_plan_per_class_period',
            ),
        ]

    def __str__(self):
        return f'{self.academic_year} | Activity {self.level} {self.term} {self.quarter}'

    def clean(self):
        validate_term_quarter(self.term, self.quarter)


class Invoice(models.Model):
    """Period container for a student's fee charges.

    Three kinds coexist (decision J-2, J-3):
      * ANNUAL     — one per student per academic year; holds the tuition line
                     (and the annual uniform line where assigned).
      * QUARTERLY  — one per student per (year, term, quarter); holds lunch,
                     transport and activity lines.
      * SALE       — uniform walk-in sales, itemised; excluded from a student's
                     billed fee balance but counted as revenue.

    ``amount_due`` / ``amount_paid`` remain real columns but are now derived
    from the invoice's lines and maintained by ``recompute_invoice`` — the old
    ``Payment.amount`` roll-up is gone.
    """
    student = models.ForeignKey(
        'students.Student', on_delete=models.PROTECT, related_name='invoices'
    )
    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.PROTECT, related_name='invoices'
    )
    kind = models.CharField(
        max_length=10, choices=InvoiceKind.choices, default=InvoiceKind.QUARTERLY
    )
    # NULL for ANNUAL and SALE invoices; required for QUARTERLY.
    term = models.CharField(max_length=10, choices=Term.choices, blank=True, null=True)
    quarter = models.CharField(max_length=5, choices=Quarter.choices, blank=True, null=True)
    amount_due = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    due_date = models.DateField()
    status = models.CharField(
        max_length=10, choices=InvoiceStatus.choices, default=InvoiceStatus.UNPAID
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-academic_year__year', 'term', 'quarter', 'student__last_name']
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'academic_year'],
                condition=models.Q(kind='ANNUAL'),
                name='uniq_annual_invoice_per_student_year',
            ),
            models.UniqueConstraint(
                fields=['student', 'academic_year', 'term', 'quarter'],
                condition=models.Q(kind='QUARTERLY'),
                name='uniq_quarterly_invoice_per_student_period',
            ),
        ]
        indexes = [
            # Defaulters/summary views filter on status + due_date together
            # (outstanding invoices past their due date).
            models.Index(fields=['status', 'due_date'], name='invoice_status_due_date_idx'),
        ]

    def __str__(self):
        period = self.term or self.get_kind_display()
        return f'{self.student.student_id} | {self.academic_year} | {period} | {self.quarter or ""}'

    def clean(self):
        if self.kind == InvoiceKind.QUARTERLY:
            if not self.term or not self.quarter:
                raise ValidationError('Quarterly invoices require a term and quarter.')
            validate_term_quarter(self.term, self.quarter)
        elif self.term or self.quarter:
            raise ValidationError(
                f'{self.get_kind_display()} invoices must not carry a term/quarter.'
            )

    @property
    def balance(self):
        return self.amount_due - self.amount_paid


class Payment(models.Model):
    """A single receipt of money from a student, spread across one or more
    fee lines via :class:`PaymentAllocation`. Student-scoped: allocations may
    target lines on the annual invoice and the quarterly invoice in one go.
    ``invoice`` is retained only for legacy rows / convenience."""
    student = models.ForeignKey(
        'students.Student', on_delete=models.PROTECT, related_name='payments',
        null=True, blank=True,
        help_text='Set on every payment; nullable only for the Phase 1 backfill window.',
    )
    invoice = models.ForeignKey(
        Invoice, on_delete=models.PROTECT, related_name='payments', null=True, blank=True
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_method = models.CharField(max_length=15, choices=PaymentMethod.choices)
    transaction_id = models.CharField(max_length=100, blank=True)
    phone_used = models.CharField(max_length=20, blank=True)
    paid_at = models.DateTimeField(db_index=True)
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='payments_received'
    )
    receipt_number = models.CharField(max_length=20, unique=True, blank=True, db_index=True)
    notes = models.TextField(blank=True)

    status = models.CharField(
        max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.ACTIVE
    )
    reversal_of = models.ForeignKey(
        'self', on_delete=models.PROTECT, null=True, blank=True, related_name='reversals'
    )
    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='payments_reversed',
    )
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversal_reason = models.TextField(blank=True)
    # Set when payment_method == CARRIED_CREDIT: the credit being drawn down.
    funded_from_credit = models.ForeignKey(
        'StudentCredit', on_delete=models.PROTECT,
        null=True, blank=True, related_name='consuming_payments',
    )

    class Meta:
        ordering = ['-paid_at']

    def __str__(self):
        return f'{self.receipt_number} | {self.student_id} | {self.amount}'


class InvoiceLine(models.Model):
    """A single fee charge assigned to a student — the concrete "what this
    student owes for this category this period". The amount is a snapshot
    resolved at assignment time and is never rewritten when configuration
    changes."""
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='lines')
    category = models.CharField(max_length=12, choices=FeeCategory.choices)
    description = models.CharField(max_length=255, blank=True)
    # Student's class when the line was created — keeps class/level reports
    # correct after a transfer.
    level_snapshot = models.CharField(max_length=10, choices=Level.choices, blank=True)

    amount = models.DecimalField(max_digits=10, decimal_places=2)
    amount_allocated = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(
        max_length=10, choices=LineStatus.choices, default=LineStatus.UNPAID
    )

    # Provenance — which configuration row produced this line (for re-sync
    # and reporting). Kept loose on purpose so any config model can own it.
    source_kind = models.CharField(max_length=20, blank=True)
    source_id = models.PositiveIntegerField(null=True, blank=True)
    is_legacy = models.BooleanField(default=False)
    # Denormalised from invoice.kind (immutable after creation) so the DB can
    # enforce "one standard line per category per invoice" while still letting
    # SALE invoices carry many uniform lines.
    is_sale = models.BooleanField(default=False)

    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='invoice_lines_voided',
    )
    void_reason = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='invoice_lines_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['invoice', 'category']
        constraints = [
            models.UniqueConstraint(
                fields=['invoice', 'category'],
                condition=models.Q(is_sale=False) & ~models.Q(status='VOID'),
                name='uniq_standard_line_per_invoice_category',
            ),
            models.CheckConstraint(
                check=models.Q(amount__gte=0), name='invoiceline_amount_nonneg'
            ),
        ]

    def __str__(self):
        return f'{self.invoice.student_id} | {self.get_category_display()} | {self.amount}'

    def save(self, *args, **kwargs):
        if self.invoice_id and not self.is_sale:
            self.is_sale = self.invoice.kind == InvoiceKind.SALE
        super().save(*args, **kwargs)

    @property
    def adjustment_total(self):
        return self.adjustments.aggregate(t=Sum('amount'))['t'] or Decimal('0')

    @property
    def net_required(self):
        return max(self.amount - self.adjustment_total, Decimal('0'))

    @property
    def outstanding(self):
        if self.status == LineStatus.VOID:
            return Decimal('0')
        return max(self.net_required - self.amount_allocated, Decimal('0'))


class UniformSaleItem(models.Model):
    """Itemised detail for a uniform walk-in sale line (decision J-9).
    ``line.amount`` == sum of ``qty * unit_price`` across its items."""
    invoice_line = models.ForeignKey(
        InvoiceLine, on_delete=models.CASCADE, related_name='sale_items'
    )
    name = models.CharField(max_length=150)
    qty = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.name} x{self.qty} @ {self.unit_price}'

    @property
    def line_total(self):
        return self.qty * self.unit_price


class FeeAdjustment(models.Model):
    """A discount / waiver / scholarship / bursary applied to one charge.
    Reduces ``net_required`` without touching ``amount`` so reports keep both
    the list price and what was forgiven. Creating one is OWNER-only
    (decision J-13)."""
    class Kind(models.TextChoices):
        DISCOUNT = 'DISCOUNT', 'Discount'
        WAIVER = 'WAIVER', 'Waiver'
        SCHOLARSHIP = 'SCHOLARSHIP', 'Scholarship'
        BURSARY = 'BURSARY', 'Bursary'

    invoice_line = models.ForeignKey(
        InvoiceLine, on_delete=models.CASCADE, related_name='adjustments'
    )
    kind = models.CharField(max_length=12, choices=Kind.choices)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField()
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='fee_adjustments_approved',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                check=models.Q(amount__gt=0), name='feeadjustment_amount_positive'
            ),
        ]

    def __str__(self):
        return f'{self.get_kind_display()} {self.amount} on line {self.invoice_line_id}'


class PaymentAllocation(models.Model):
    """The portion of a payment applied to one fee line. The sum of a
    payment's allocations always equals ``payment.amount`` (enforced in
    ``fees.services.allocate_payment``); no single line may be allocated
    beyond its outstanding balance — overpayment is not accepted
    (decision J-7)."""
    payment = models.ForeignKey(
        Payment, on_delete=models.CASCADE, related_name='allocations'
    )
    invoice_line = models.ForeignKey(
        InvoiceLine, on_delete=models.PROTECT, related_name='allocations'
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(
                fields=['payment', 'invoice_line'], name='uniq_alloc_per_payment_line'
            ),
            models.CheckConstraint(
                check=models.Q(amount__gt=0), name='allocation_amount_positive'
            ),
        ]

    def __str__(self):
        return f'{self.payment.receipt_number} → {self.invoice_line.category} {self.amount}'


class StudentCredit(models.Model):
    """Carried credit (decision J-6). Created when a charge with money already
    on it is voided, or when a payment is reversed. Drawn down by recording a
    Payment with ``payment_method = CARRIED_CREDIT`` and
    ``funded_from_credit`` set."""
    class Source(models.TextChoices):
        VOID_LINE = 'VOID_LINE', 'Voided charge'
        PAYMENT_REVERSAL = 'PAYMENT_REVERSAL', 'Payment reversal'
        MANUAL = 'MANUAL', 'Manual'

    student = models.ForeignKey(
        'students.Student', on_delete=models.PROTECT, related_name='fee_credits'
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    remaining_amount = models.DecimalField(max_digits=10, decimal_places=2)
    source = models.CharField(max_length=20, choices=Source.choices)
    source_line = models.ForeignKey(
        InvoiceLine, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='credits_from_void',
    )
    source_payment = models.ForeignKey(
        Payment, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='credits_from_reversal',
    )
    reason = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='fee_credits_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                check=models.Q(amount__gt=0), name='studentcredit_amount_positive'
            ),
            models.CheckConstraint(
                check=models.Q(remaining_amount__gte=0),
                name='studentcredit_remaining_nonneg',
            ),
        ]

    def __str__(self):
        return f'{self.student.student_id} credit {self.remaining_amount}/{self.amount}'


# ── Derivation helpers ────────────────────────────────────────────────────────
# amount_allocated / status on a line, and amount_due / amount_paid / status on
# an invoice, are denormalised for query performance and kept in step here.

def recompute_line(line: InvoiceLine) -> None:
    if line.status == LineStatus.VOID:
        if line.amount_allocated:
            line.amount_allocated = Decimal('0')
            line.save(update_fields=['amount_allocated'])
        return

    allocated = line.allocations.filter(
        payment__status=PaymentStatus.ACTIVE
    ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
    net_required = line.net_required

    line.amount_allocated = allocated
    if line.adjustment_total >= line.amount and allocated <= 0:
        line.status = LineStatus.WAIVED
    elif allocated <= 0:
        line.status = LineStatus.UNPAID
    elif allocated >= net_required:
        line.status = LineStatus.PAID
    else:
        line.status = LineStatus.PARTIAL
    line.save(update_fields=['amount_allocated', 'status'])


def recompute_invoice(invoice: Invoice) -> None:
    lines = list(invoice.lines.exclude(status=LineStatus.VOID))
    due = sum((ln.amount for ln in lines), Decimal('0'))
    paid = sum((ln.amount_allocated for ln in lines), Decimal('0'))
    payable = sum((ln.net_required for ln in lines), Decimal('0'))

    invoice.amount_due = due
    invoice.amount_paid = paid
    if paid <= 0:
        invoice.status = InvoiceStatus.UNPAID
    elif paid >= payable:
        invoice.status = InvoiceStatus.PAID
    else:
        invoice.status = InvoiceStatus.PARTIAL
    invoice.save(update_fields=['amount_due', 'amount_paid', 'status'])


@receiver(post_save, sender=Payment)
def assign_receipt_number(sender, instance, created, **kwargs):
    if not created or instance.receipt_number:
        return
    year = instance.paid_at.year
    number = f'RCP-{year}-{str(instance.pk).zfill(5)}'
    Payment.objects.filter(pk=instance.pk).update(receipt_number=number)
    instance.receipt_number = number


@receiver(post_save, sender=Payment)
def recompute_lines_on_payment_status_change(sender, instance, created, **kwargs):
    """A payment being reversed (or un-reversed) changes every line it funded."""
    if created:
        return
    seen: set[int] = set()
    for alloc in instance.allocations.select_related('invoice_line__invoice'):
        line = alloc.invoice_line
        recompute_line(line)
        if line.invoice_id not in seen:
            recompute_invoice(line.invoice)
            seen.add(line.invoice_id)


@receiver(post_save, sender=PaymentAllocation)
@receiver(post_delete, sender=PaymentAllocation)
def recompute_on_allocation_change(sender, instance, **kwargs):
    line = instance.invoice_line
    recompute_line(line)
    recompute_invoice(line.invoice)


@receiver(post_save, sender=InvoiceLine)
@receiver(post_delete, sender=InvoiceLine)
def recompute_on_line_change(sender, instance, **kwargs):
    """Keep the invoice's derived columns in step when a charge is added,
    edited, voided or removed (the Phase 3 assignment engine leans on this)."""
    if instance.invoice_id:
        recompute_invoice(instance.invoice)


@receiver(post_save, sender=FeeAdjustment)
@receiver(post_delete, sender=FeeAdjustment)
def recompute_on_adjustment_change(sender, instance, **kwargs):
    line = instance.invoice_line
    recompute_line(line)
    recompute_invoice(line.invoice)
