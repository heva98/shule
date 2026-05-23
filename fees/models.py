from django.conf import settings
from django.db import models
from django.db.models import Sum
from django.db.models.signals import post_save
from django.dispatch import receiver

from students.models import Level


class Term(models.TextChoices):
    TERM1 = 'TERM1', 'Term 1'
    TERM2 = 'TERM2', 'Term 2'
    TERM3 = 'TERM3', 'Term 3'


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

    term1_start = models.DateField(null=True, blank=True)
    term1_end = models.DateField(null=True, blank=True)
    term2_start = models.DateField(null=True, blank=True)
    term2_end = models.DateField(null=True, blank=True)
    term3_start = models.DateField(null=True, blank=True)
    term3_end = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['-year']

    def __str__(self):
        return str(self.year)

    def save(self, *args, **kwargs):
        # Enforce only one current year at a time
        if self.is_current:
            AcademicYear.objects.exclude(pk=self.pk).update(is_current=False)
        super().save(*args, **kwargs)


class FeeStructure(models.Model):
    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.PROTECT, related_name='fee_structures'
    )
    level = models.CharField(max_length=10, choices=Level.choices)
    term = models.CharField(max_length=10, choices=Term.choices)

    tuition_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    lunch_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    transport_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    uniform_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    activity_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        unique_together = ('academic_year', 'level', 'term')
        ordering = ['academic_year', 'level', 'term']

    def __str__(self):
        return f'{self.academic_year} | {self.level} | {self.term}'

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
    amount_due = models.DecimalField(max_digits=10, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    due_date = models.DateField()
    status = models.CharField(
        max_length=10, choices=InvoiceStatus.choices, default=InvoiceStatus.UNPAID
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('student', 'academic_year', 'term')
        ordering = ['-academic_year__year', 'term', 'student__last_name']

    def __str__(self):
        return f'{self.student.student_id} | {self.academic_year} | {self.term}'

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

    # Generate receipt number if not already set
    if not instance.receipt_number:
        year = instance.paid_at.year
        seq = str(instance.pk).zfill(5)
        Payment.objects.filter(pk=instance.pk).update(
            receipt_number=f'RCP-{year}-{seq}'
        )
        instance.receipt_number = f'RCP-{year}-{seq}'
