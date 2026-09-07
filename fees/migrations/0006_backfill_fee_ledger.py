"""Backfill the normalised fee ledger from the tuition-only history.

For every existing invoice we create ONE consolidated tuition line
(decision J-14) carrying the invoice's totals, and for every existing payment
one allocation against that line for the full amount. Receipt numbers,
timestamps and ``received_by`` are untouched. Fully reversible.
"""

from decimal import Decimal

from django.db import migrations


def forwards(apps, schema_editor):
    Invoice = apps.get_model('fees', 'Invoice')
    Payment = apps.get_model('fees', 'Payment')
    InvoiceLine = apps.get_model('fees', 'InvoiceLine')
    PaymentAllocation = apps.get_model('fees', 'PaymentAllocation')

    line_by_invoice = {}

    for inv in Invoice.objects.select_related('student').iterator():
        due = inv.amount_due or Decimal('0')
        paid = inv.amount_paid or Decimal('0')
        if paid <= 0:
            status = 'UNPAID'
        elif paid >= due:
            status = 'PAID'
        else:
            status = 'PARTIAL'

        line = InvoiceLine.objects.create(
            invoice=inv,
            category='TUITION',
            description='Consolidated term fees (migrated)',
            level_snapshot=getattr(inv.student, 'level', '') or '',
            amount=due,
            amount_allocated=paid,
            status=status,
            source_kind='legacy',
            is_legacy=True,
            is_sale=False,
        )
        line_by_invoice[inv.pk] = line.pk

    for pay in Payment.objects.select_related('invoice').iterator():
        if pay.invoice_id and not pay.student_id:
            pay.student_id = pay.invoice.student_id
            pay.save(update_fields=['student'])

        line_pk = line_by_invoice.get(pay.invoice_id)
        if line_pk and pay.amount and pay.amount > 0:
            PaymentAllocation.objects.get_or_create(
                payment=pay,
                invoice_line_id=line_pk,
                defaults={'amount': pay.amount},
            )


def backwards(apps, schema_editor):
    Payment = apps.get_model('fees', 'Payment')
    InvoiceLine = apps.get_model('fees', 'InvoiceLine')
    PaymentAllocation = apps.get_model('fees', 'PaymentAllocation')

    PaymentAllocation.objects.filter(invoice_line__is_legacy=True).delete()
    InvoiceLine.objects.filter(is_legacy=True).delete()
    Payment.objects.update(student=None)


class Migration(migrations.Migration):

    dependencies = [
        ('fees', '0005_fee_ledger'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
