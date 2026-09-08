"""Itemised payment-confirmation and fee-reminder SMS (Phase 6): the
per-category `{breakdown}` placeholder is populated from real allocations /
outstanding invoice lines."""

import datetime
from decimal import Decimal

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import Role, SchoolSettings
from communications.models import SmsBatch, SmsConfiguration, SmsMessage
from communications.sms_audiences import (
    fee_reminder_recipients,
    payment_thank_you_recipients,
)
from shule.factories import make_academic_year, make_student, make_user

from communications.tests_sms import add_guardian, seed_templates
from fees.models import FeeCategory, Invoice, InvoiceKind, InvoiceLine, Payment
from fees.services import allocate_payment


@override_settings(ENABLED_MODULES=["sms", "fees"], SMS_BACKEND="noop")
class BreakdownContextTests(TestCase):
    def setUp(self):
        seed_templates()
        self.year = make_academic_year()
        self.bursar = make_user(role=Role.BURSAR)
        self.student = make_student(level="STD3", first_name="Juma")
        add_guardian(self.student, phone="0713900500")

        self.invoice = Invoice.objects.create(
            student=self.student, academic_year=self.year, kind=InvoiceKind.QUARTERLY,
            term="TERM1", quarter="Q1", due_date=datetime.date(2026, 3, 1),
        )
        self.tuition = InvoiceLine.objects.create(
            invoice=self.invoice, category=FeeCategory.TUITION, amount=Decimal("300000"),
        )
        self.transport = InvoiceLine.objects.create(
            invoice=self.invoice, category=FeeCategory.TRANSPORT, amount=Decimal("100000"),
        )
        self.activity = InvoiceLine.objects.create(
            invoice=self.invoice, category=FeeCategory.ACTIVITY, amount=Decimal("20000"),
        )

    def _pay(self, splits):
        total = sum(a for _, a in splits)
        p = Payment.objects.create(
            student=self.student, amount=total, payment_method="CASH",
            paid_at=datetime.datetime(2026, 2, 1, 9, 0), received_by=self.bursar,
        )
        allocate_payment(p, splits)
        return p

    def test_payment_breakdown_lists_each_category(self):
        p = self._pay([
            (self.tuition, Decimal("3000")),
            (self.transport, Decimal("1000")),
            (self.activity, Decimal("700")),
        ])
        ctx = payment_thank_you_recipients(p)[0].context
        self.assertEqual(
            ctx["breakdown"],
            "Tuition TZS 3,000, Transport TZS 1,000, Activity TZS 700",
        )
        self.assertEqual(ctx["amount"], "4,700")

    def test_payment_breakdown_fallback_when_no_allocations(self):
        p = Payment.objects.create(
            student=self.student, amount=Decimal("5000"), payment_method="CASH",
            paid_at=datetime.datetime(2026, 2, 1, 9, 0), received_by=self.bursar,
        )
        ctx = payment_thank_you_recipients(p)[0].context
        self.assertEqual(ctx["breakdown"], "TZS 5,000")

    def test_reminder_breakdown_only_outstanding_categories(self):
        # clear activity in full, part-pay transport, leave tuition untouched
        self._pay([
            (self.activity, Decimal("20000")),
            (self.transport, Decimal("20000")),
        ])
        recips = fee_reminder_recipients(scope="all")
        self.assertEqual(len(recips), 1)
        ctx = recips[0].context
        self.assertIn("Tuition TZS 300,000", ctx["breakdown"])
        self.assertIn("Transport TZS 80,000", ctx["breakdown"])
        self.assertNotIn("Activity", ctx["breakdown"])
        self.assertEqual(ctx["balance"], "380,000")


@override_settings(ENABLED_MODULES=["sms", "fees"], SMS_BACKEND="noop",
                   CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class ItemisedPaymentSmsTests(TestCase):
    def setUp(self):
        seed_templates()
        s = SchoolSettings.get_settings()
        s.school_name = "Shule Bora"
        s.save()
        self.year = make_academic_year()
        self.bursar = make_user(role=Role.BURSAR)
        cfg = SmsConfiguration.load()
        cfg.auto_payment_thank_you = True
        cfg.save()

    def test_confirmation_sms_body_has_breakdown(self):
        student = make_student(level="STD2", first_name="Neema")
        add_guardian(student, phone="0713900600")
        inv = Invoice.objects.create(
            student=student, academic_year=self.year, kind=InvoiceKind.QUARTERLY,
            term="TERM1", quarter="Q1", due_date=datetime.date(2026, 3, 1),
        )
        line = InvoiceLine.objects.create(
            invoice=inv, category=FeeCategory.TUITION, amount=Decimal("100000"),
        )

        with self.captureOnCommitCallbacks(execute=True):
            p = Payment.objects.create(
                student=student, amount=Decimal("40000"), payment_method="CASH",
                paid_at=datetime.datetime(2026, 5, 1, 9, 0), received_by=self.bursar,
            )
            allocate_payment(p, [(line, Decimal("40000"))])

        msg = SmsMessage.objects.get(batch__kind=SmsBatch.Kind.PAYMENT_RECEIVED)
        self.assertIn("Tuition TZS 40,000", msg.body)
