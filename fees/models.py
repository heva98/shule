from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Sum
from django.db.models.signals import post_save
from django.dispatch import receiver

from students.models import Level
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


class FeeStructure(models.Model):
    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.PROTECT, related_name='fee_structures'
    )
    level = models.CharField(max_length=10, choices=Level.choices)
    term = models.CharField(max_length=10, choices=Term.choices)
    quarter = models.CharField(max_length=5, choices=Quarter.choices)

    tuition_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    lunch_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    transport_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    uniform_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    activity_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        unique_together = ('academic_year', 'level', 'term', 'quarter')
        ordering = ['academic_year', 'level', 'term', 'quarter']

    def __str__(self):
        return f'{self.academic_year} | {self.level} | {self.term} | {self.quarter}'

    def clean(self):
        validate_term_quarter(self.term, self.quarter)

    @property
    def period_label(self):
        term_label = dict(Term.choices).get(self.term, self.term)
        quarter_label = dict(Quarter.choices).get(self.quarter, self.quarter)
        return f'{term_label} — {quarter_label}'

    @property
    def total_fee(self):
        return (
            self.tuition_fee
            + self.lunch_fee
            + self.transport_fee
            + self.uniform_fee
            + self.activity_fee
        )


class Invoice(models.Model):
    student = models.ForeignKey(
        'students.Student', on_delete=models.PROTECT, related_name='invoices'
    )
    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.PROTECT, related_name='invoices'
    )
    term = models.CharField(max_length=10, choices=Term.choices)
    quarter = models.CharField(max_length=5, choices=Quarter.choices)
    amount_due = models.DecimalField(max_digits=10, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    due_date = models.DateField()
    status = models.CharField(
        max_length=10, choices=InvoiceStatus.choices, default=InvoiceStatus.UNPAID
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('student', 'academic_year', 'term', 'quarter')
        ordering = ['-academic_year__year', 'term', 'quarter', 'student__last_name']

    def __str__(self):
        return f'{self.student.student_id} | {self.academic_year} | {self.term} | {self.quarter}'

    def clean(self):
        validate_term_quarter(self.term, self.quarter)

    @property
    def balance(self):
        return self.amount_due - self.amount_paid

    def refresh_status(self):
        if self.amount_paid <= 0:
            self.status = InvoiceStatus.UNPAID
        elif self.amount_paid >= self.amount_due:
            self.status = InvoiceStatus.PAID
        else:
            self.status = InvoiceStatus.PARTIAL
        self.save(update_fields=['status', 'amount_paid'])


class Payment(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name='payments')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_method = models.CharField(max_length=15, choices=PaymentMethod.choices)
    transaction_id = models.CharField(max_length=100, blank=True)
    phone_used = models.CharField(max_length=20, blank=True)
    paid_at = models.DateTimeField()
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='payments_received'
    )
    receipt_number = models.CharField(max_length=20, unique=True, blank=True, db_index=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-paid_at']

    def __str__(self):
        return f'{self.receipt_number} | {self.invoice} | {self.amount}'


@receiver(post_save, sender=Payment)
def update_invoice_on_payment(sender, instance, created, **kwargs):
    if not created:
        return
    invoice = instance.invoice
    total_paid = invoice.payments.aggregate(total=Sum('amount'))['total'] or 0
    invoice.amount_paid = total_paid
    invoice.refresh_status()

    if not instance.receipt_number:
        year = instance.paid_at.year
        seq = str(instance.pk).zfill(5)
        Payment.objects.filter(pk=instance.pk).update(
            receipt_number=f'RCP-{year}-{seq}'
        )
        instance.receipt_number = f'RCP-{year}-{seq}'
