"""Post-migration sanity check for the normalised fee ledger.

Run after ``migrate fees`` (0005 + 0006). Exits non-zero if any invariant
fails so it can gate a deploy.
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum

from fees.models import Invoice, InvoiceLine, LineStatus, Payment, PaymentAllocation


class Command(BaseCommand):
    help = 'Verify the fee-ledger backfill preserved every historical total.'

    def handle(self, *args, **options):
        problems: list[str] = []

        missing_student = Payment.objects.filter(student__isnull=True).count()
        if missing_student:
            problems.append(f'{missing_student} payment(s) still have no student.')

        pay_total = Payment.objects.filter(invoice__isnull=False).aggregate(
            t=Sum('amount')
        )['t'] or Decimal('0')
        alloc_total = PaymentAllocation.objects.filter(
            invoice_line__is_legacy=True
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
        if pay_total != alloc_total:
            problems.append(
                f'Legacy allocation total {alloc_total} != historical payment total {pay_total}.'
            )

        checked = mismatched = 0
        for inv in Invoice.objects.prefetch_related('lines').iterator():
            checked += 1
            lines = [ln for ln in inv.lines.all() if ln.status != LineStatus.VOID]
            due = sum((ln.amount for ln in lines), Decimal('0'))
            paid = sum((ln.amount_allocated for ln in lines), Decimal('0'))
            if due != inv.amount_due or paid != inv.amount_paid:
                mismatched += 1
                if mismatched <= 20:
                    problems.append(
                        f'Invoice {inv.pk}: columns due={inv.amount_due}/paid={inv.amount_paid} '
                        f'vs lines due={due}/paid={paid}.'
                    )

        self.stdout.write(
            f'Checked {checked} invoice(s), {InvoiceLine.objects.count()} line(s), '
            f'{PaymentAllocation.objects.count()} allocation(s).'
        )

        if problems:
            self.stderr.write(self.style.ERROR('FAIL:'))
            for p in problems:
                self.stderr.write(f'  - {p}')
            raise SystemExit(1)

        self.stdout.write(self.style.SUCCESS('OK — every historical total reconciles.'))
