"""Exercise the 0006 backfill: roll back to 0005, create tuition-era rows,
roll forward, and assert every historical total reconciles."""

import datetime

from django.db.migrations.executor import MigrationExecutor
from django.db import connection
from django.test import TransactionTestCase

from accounts.models import Role
from shule.factories import make_academic_year, make_student, make_user


class BackfillLegacyLedgerTests(TransactionTestCase):
    migrate_from = [('fees', '0005_fee_ledger')]
    migrate_to = [('fees', '0006_backfill_fee_ledger')]

    def _migrate(self, targets):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(targets)
        executor.loader.build_graph()

    def test_backfill_preserves_totals(self):
        self._migrate(self.migrate_from)

        year = make_academic_year()
        student = make_student(level='STD4')
        bursar = make_user(role=Role.BURSAR)

        # Models at state 0005: Invoice already has `kind` (default QUARTERLY),
        # InvoiceLine / PaymentAllocation exist but nothing populates them.
        from fees.models import Invoice, Payment

        paid_inv = Invoice.objects.create(
            student=student, academic_year=year, kind='QUARTERLY',
            term='TERM1', quarter='Q1', amount_due=300000, amount_paid=120000,
            status='PARTIAL', due_date=datetime.date(2026, 3, 1),
        )
        Payment.objects.create(
            invoice=paid_inv, amount=100000, payment_method='CASH',
            paid_at=datetime.datetime(2026, 2, 1, 10, 0), received_by=bursar,
            receipt_number='RCP-2026-00001',
        )
        Payment.objects.create(
            invoice=paid_inv, amount=20000, payment_method='CASH',
            paid_at=datetime.datetime(2026, 2, 15, 10, 0), received_by=bursar,
            receipt_number='RCP-2026-00002',
        )
        unpaid_inv = Invoice.objects.create(
            student=student, academic_year=year, kind='QUARTERLY',
            term='TERM2', quarter='Q3', amount_due=50000, amount_paid=0,
            status='UNPAID', due_date=datetime.date(2026, 8, 1),
        )

        self._migrate(self.migrate_to)

        from fees.models import InvoiceLine, PaymentAllocation

        paid_line = InvoiceLine.objects.get(invoice=paid_inv)
        self.assertEqual(paid_line.category, 'TUITION')
        self.assertTrue(paid_line.is_legacy)
        self.assertEqual(paid_line.amount, 300000)
        self.assertEqual(paid_line.amount_allocated, 120000)
        self.assertEqual(paid_line.status, 'PARTIAL')

        self.assertEqual(
            PaymentAllocation.objects.filter(invoice_line=paid_line).count(), 2
        )
        self.assertEqual(
            sum(a.amount for a in PaymentAllocation.objects.filter(invoice_line=paid_line)),
            120000,
        )

        unpaid_line = InvoiceLine.objects.get(invoice=unpaid_inv)
        self.assertEqual(unpaid_line.status, 'UNPAID')
        self.assertEqual(unpaid_line.amount_allocated, 0)

        for pay in Payment.objects.all():
            self.assertEqual(pay.student_id, student.id)

    def tearDown(self):
        # Leave the schema at the latest migration for the rest of the suite.
        self._migrate([('fees', '0006_backfill_fee_ledger')])
