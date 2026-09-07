"""
SMS module tests. No provider credentials, no real sends — everything runs on
the `noop` backend and asserts on recorded SmsBatch / SmsMessage rows.
"""

import datetime
from decimal import Decimal

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import Role, SchoolSettings
from communications.models import (
    SmsBatch,
    SmsConfiguration,
    SmsMessage,
    SmsTemplateKey,
)
from communications.sms_segments import count_segments, is_gsm7
from communications.sms_templates import (
    DEFAULT_TEMPLATES,
    MissingPlaceholder,
    render,
)
from communications.management.commands.seed_sms_templates import Command as SeedCmd
from shule.factories import make_academic_year, make_staff, make_student, make_subject, make_user
from shule.phone import normalize_tz_phone
from students.models import Guardian


def seed_templates():
    SeedCmd().handle(force=True)


def add_guardian(student, phone="0713111222", primary=True, **kw):
    return Guardian.objects.create(
        student=student, full_name=kw.get("full_name", f"Guardian of {student.first_name}"),
        relationship="MOTHER", phone=phone, is_primary_contact=primary,
        sms_opt_out=kw.get("sms_opt_out", False),
    )


# ── pure helpers ───────────────────────────────────────────────────────────

class PhoneNormalisationTests(TestCase):
    def test_local_and_international_forms(self):
        for raw in ("0713123123", "255713123123", "+255 713 123 123", "713123123", "00255713123123"):
            self.assertEqual(normalize_tz_phone(raw), "+255713123123")

    def test_rejects_non_tz(self):
        self.assertIsNone(normalize_tz_phone("+254713123123"))
        self.assertIsNone(normalize_tz_phone("12345"))
        self.assertIsNone(normalize_tz_phone(""))

    def test_guardian_save_normalises(self):
        s = make_student()
        g = add_guardian(s, phone="0713-123-123")
        g.refresh_from_db()
        self.assertEqual(g.phone, "+255713123123")

    def test_guardian_save_keeps_unparseable_untouched(self):
        s = make_student()
        g = add_guardian(s, phone="not a phone")
        g.refresh_from_db()
        self.assertEqual(g.phone, "not a phone")


class SegmentTests(TestCase):
    def test_swahili_default_templates_are_gsm7_and_within_cap(self):
        ctx = dict(
            school_name="Shule Bora", pupil_name="Asha Juma Mwakalinga",
            student_name="Asha Juma Mwakalinga", school_contact="+255 22 123 4567",
            exam_name="Mtihani wa Katikati", total="412", out_of="600",
            average="68.7", grade="B", position="5", class_size="42",
            balance="450,000", due_date="12 Oct 2026", term="Term 1",
            amount="200,000", payment_date="1 Oct 2026", receipt_number="RCP-2026-00042",
            outstanding_balance="250,000", message="Test notice",
            closing_date="20 Dec 2026", opening_date="12 Jan 2027",
        )
        ctx["class"] = "Kidato cha 2 A"
        for (key, lang), body in DEFAULT_TEMPLATES.items():
            rendered = render(body, ctx)
            self.assertTrue(is_gsm7(rendered), f"{key}/{lang} is not GSM-7")
            self.assertLessEqual(count_segments(rendered), 3, f"{key}/{lang} too long")

    def test_render_skips_on_missing_value(self):
        body = DEFAULT_TEMPLATES[(SmsTemplateKey.EXAM_RESULTS, "SW")]
        with self.assertRaises(MissingPlaceholder):
            render(body, {"school_name": "X"})


# ── module gating ──────────────────────────────────────────────────────────

class ModuleGatingTests(TestCase):
    def setUp(self):
        seed_templates()
        self.head = make_user(role=Role.HEADTEACHER)
        self.client = APIClient()
        self.client.force_authenticate(self.head)

    @override_settings(ENABLED_MODULES=["fees"])
    def test_sms_endpoints_403_when_module_off(self):
        self.assertEqual(self.client.get("/api/communications/sms/config/").status_code, 403)
        self.assertEqual(
            self.client.post("/api/communications/sms/preview/", {"kind": "ANNOUNCEMENT"},
                             format="json").status_code, 403)

    @override_settings(ENABLED_MODULES=["sms"])
    def test_sms_config_ok_when_module_on(self):
        self.assertEqual(self.client.get("/api/communications/sms/config/").status_code, 200)


# ── permissions & scope ────────────────────────────────────────────────────

class PermissionTests(TestCase):
    def setUp(self):
        seed_templates()
        self.year = make_academic_year()

    def _client(self, role):
        c = APIClient()
        c.force_authenticate(make_user(role=role))
        return c

    def test_teacher_cannot_send_announcement(self):
        resp = self._client(Role.TEACHER).post(
            "/api/communications/sms/send/",
            {"kind": "ANNOUNCEMENT", "audience": "SCHOOL", "message": "Hi"}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_bursar_can_send_announcement(self):
        make_student()
        resp = self._client(Role.BURSAR).post(
            "/api/communications/sms/send/",
            {"kind": "ANNOUNCEMENT", "audience": "SCHOOL", "message": "Hi"}, format="json")
        self.assertEqual(resp.status_code, 201)

    @override_settings(ENABLED_MODULES=["sms"])
    def test_fee_reminder_needs_fees_module(self):
        resp = self._client(Role.BURSAR).post(
            "/api/communications/sms/send/", {"kind": "FEE_REMINDER"}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_class_teacher_cannot_send_other_classes_results(self):
        staff = make_staff(role=Role.CLASS_TEACHER)
        from staff.models import ClassTeacherAssignment
        ClassTeacherAssignment.objects.create(
            teacher=staff, level="FORM1", stream="A", academic_year=self.year,
            assigned_by=make_user(role=Role.HEADTEACHER), is_active=True)
        from exams.models import Exam
        exam = Exam.objects.create(
            name="Mid", academic_year=self.year, term="TERM1", quarter="Q1",
            level="FORM1", stream="B", exam_type="MIDTERM",
            start_date=datetime.date(2026, 3, 1), end_date=datetime.date(2026, 3, 5),
            created_by=staff.user)
        c = APIClient()
        c.force_authenticate(staff.user)
        resp = c.post("/api/communications/sms/send/",
                      {"kind": "EXAM_RESULTS", "exam_id": exam.pk}, format="json")
        self.assertEqual(resp.status_code, 403)


# ── send / dry-run / idempotency ──────────────────────────────────────────

@override_settings(ENABLED_MODULES=["sms", "fees"], SMS_BACKEND="noop",
                   CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class SendTests(TestCase):
    def setUp(self):
        seed_templates()
        s = SchoolSettings.get_settings()
        s.school_name = "Shule Bora"
        s.save()
        self.head = make_user(role=Role.HEADTEACHER)
        self.client = APIClient()
        self.client.force_authenticate(self.head)

    def test_announcement_records_one_message_per_pupil(self):
        a, b = make_student(level="FORM1"), make_student(level="FORM1")
        add_guardian(a, phone="0713000001")
        add_guardian(b, phone="0713000002")
        resp = self.client.post(
            "/api/communications/sms/send/",
            {"kind": "ANNOUNCEMENT", "audience": "SCHOOL", "message": "Closing Friday"}, format="json")
        self.assertEqual(resp.status_code, 201)
        batch = SmsBatch.objects.get(pk=resp.data["id"])
        self.assertEqual(batch.messages.count(), 2)
        self.assertEqual(batch.messages.filter(status=SmsMessage.Status.SENT).count(), 2)
        self.assertTrue(all(m.body.startswith("Shule Bora: Closing Friday") for m in batch.messages.all()))

    def test_same_contact_two_children_gets_two_messages(self):
        a = make_student(level="FORM1", first_name="Amina")
        b = make_student(level="FORM1", first_name="Bakari")
        add_guardian(a, phone="0713555555")
        add_guardian(b, phone="0713555555")  # same number, different pupil
        self.client.post("/api/communications/sms/send/",
                         {"kind": "ANNOUNCEMENT", "audience": "SCHOOL", "message": "Hi"}, format="json")
        self.assertEqual(SmsMessage.objects.filter(status=SmsMessage.Status.SENT).count(), 2)

    def test_opt_out_is_skipped(self):
        a = make_student(level="FORM1")
        add_guardian(a, phone="0713000009", sms_opt_out=True)
        resp = self.client.post("/api/communications/sms/send/",
                                {"kind": "ANNOUNCEMENT", "audience": "SCHOOL", "message": "Hi"}, format="json")
        batch = SmsBatch.objects.get(pk=resp.data["id"])
        msg = batch.messages.get()
        self.assertEqual(msg.status, SmsMessage.Status.SKIPPED)
        self.assertIn("opted out", msg.skip_reason)

    def test_invalid_number_is_skipped_not_sent(self):
        a = make_student(level="FORM1")
        g = Guardian.objects.create(student=a, full_name="G", relationship="MOTHER",
                                    phone="garbage", is_primary_contact=True)
        resp = self.client.post("/api/communications/sms/send/",
                                {"kind": "ANNOUNCEMENT", "audience": "SCHOOL", "message": "Hi"}, format="json")
        batch = SmsBatch.objects.get(pk=resp.data["id"])
        self.assertEqual(batch.messages.get().status, SmsMessage.Status.SKIPPED)

    def test_dry_run_builds_but_does_not_send(self):
        a = make_student(level="FORM1")
        add_guardian(a, phone="0713000010")
        resp = self.client.post(
            "/api/communications/sms/send/",
            {"kind": "ANNOUNCEMENT", "audience": "SCHOOL", "message": "Hi", "dry_run": True},
            format="json")
        self.assertEqual(resp.status_code, 201)
        batch = SmsBatch.objects.get(pk=resp.data["id"])
        self.assertTrue(batch.dry_run)
        self.assertEqual(batch.status, SmsBatch.Status.PENDING)
        self.assertEqual(batch.messages.filter(status=SmsMessage.Status.SENT).count(), 0)
        self.assertEqual(batch.messages.filter(status=SmsMessage.Status.PENDING).count(), 1)

    def test_language_param_overrides_school_default(self):
        # School default is Swahili; the composer asks for English on this send.
        self.assertEqual(SmsConfiguration.load().language, "SW")
        a = make_student(level="FORM1")
        add_guardian(a, phone="0713000021")
        resp = self.client.post(
            "/api/communications/sms/send/",
            {"kind": "ANNOUNCEMENT", "audience": "SCHOOL", "message": "Hi", "language": "EN"},
            format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(SmsBatch.objects.get(pk=resp.data["id"]).language, "EN")

    def test_language_param_unknown_falls_back_to_school_default(self):
        a = make_student(level="FORM1")
        add_guardian(a, phone="0713000022")
        resp = self.client.post(
            "/api/communications/sms/send/",
            {"kind": "ANNOUNCEMENT", "audience": "SCHOOL", "message": "Hi", "language": "FR"},
            format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(SmsBatch.objects.get(pk=resp.data["id"]).language, "SW")

    def test_preview_echoes_chosen_language(self):
        make_student(level="FORM1")
        resp = self.client.post(
            "/api/communications/sms/preview/",
            {"kind": "ANNOUNCEMENT", "audience": "SCHOOL", "message": "Hi", "language": "EN"},
            format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["language"], "EN")

    def test_preview_reports_counts_without_persisting(self):
        for i in range(3):
            st = make_student(level="FORM2")
            add_guardian(st, phone=f"071300{i:04d}")
        before = SmsBatch.objects.count()
        resp = self.client.post(
            "/api/communications/sms/preview/",
            {"kind": "ANNOUNCEMENT", "audience": "LEVEL", "level": "FORM2", "message": "Hi"},
            format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["would_send"], 3)
        self.assertEqual(SmsBatch.objects.count(), before)

    def test_resend_failed_is_idempotent_on_sent_rows(self):
        a = make_student(level="FORM1")
        add_guardian(a, phone="0713000011")
        resp = self.client.post("/api/communications/sms/send/",
                                {"kind": "ANNOUNCEMENT", "audience": "SCHOOL", "message": "Hi"}, format="json")
        batch = SmsBatch.objects.get(pk=resp.data["id"])
        msg = batch.messages.get()
        first_provider_id = msg.provider_message_id
        # Re-run delivery directly — SENT rows must be left alone.
        from communications.sms_service import send_batch
        send_batch(batch.pk)
        msg.refresh_from_db()
        self.assertEqual(msg.provider_message_id, first_provider_id)
        self.assertEqual(batch.messages.filter(status=SmsMessage.Status.SENT).count(), 1)

    @override_settings(SMS_BATCH_RECIPIENT_CAP=2)
    def test_recipient_cap_rejects_oversized_batch(self):
        for i in range(3):
            st = make_student(level="FORM3")
            add_guardian(st, phone=f"071302{i:04d}")
        resp = self.client.post(
            "/api/communications/sms/send/",
            {"kind": "ANNOUNCEMENT", "audience": "LEVEL", "level": "FORM3", "message": "Hi"},
            format="json")
        self.assertEqual(resp.status_code, 400)


# ── fee reminders ─────────────────────────────────────────────────────────

@override_settings(ENABLED_MODULES=["sms", "fees"], SMS_BACKEND="noop",
                   CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class FeeReminderTests(TestCase):
    def setUp(self):
        seed_templates()
        s = SchoolSettings.get_settings()
        s.school_name = "Shule Bora"
        s.school_phone = "+255 22 123 4567"
        s.save()
        self.year = make_academic_year()
        self.bursar = make_user(role=Role.BURSAR)
        self.client = APIClient()
        self.client.force_authenticate(self.bursar)

    def _invoice(self, student, due, paid=0, amount=100000):
        from fees.models import Invoice
        return Invoice.objects.create(
            student=student, academic_year=self.year, term="TERM1", quarter="Q1",
            amount_due=amount, amount_paid=paid, due_date=due, status="UNPAID")

    def test_overdue_vs_due_templates_chosen_per_pupil(self):
        overdue_s = make_student(level="FORM1", first_name="Over")
        due_s = make_student(level="FORM1", first_name="Due")
        add_guardian(overdue_s, phone="0713100001")
        add_guardian(due_s, phone="0713100002")
        self._invoice(overdue_s, due=datetime.date(2000, 1, 1))
        self._invoice(due_s, due=datetime.date(2999, 1, 1))
        resp = self.client.post("/api/communications/sms/send/",
                                {"kind": "FEE_REMINDER", "scope": "all"}, format="json")
        self.assertEqual(resp.status_code, 201)
        batch = SmsBatch.objects.get(pk=resp.data["id"])
        bodies = {m.student.first_name: m.body for m in batch.messages.all()}
        self.assertIn("muda wake wa malipo umepita", bodies["Over"])
        self.assertNotIn("muda wake wa malipo umepita", bodies["Due"])

    def test_scope_overdue_only_excludes_not_yet_due(self):
        due_s = make_student(level="FORM1")
        add_guardian(due_s, phone="0713100003")
        self._invoice(due_s, due=datetime.date(2999, 1, 1))
        resp = self.client.post("/api/communications/sms/send/",
                                {"kind": "FEE_REMINDER", "scope": "overdue"}, format="json")
        batch = SmsBatch.objects.get(pk=resp.data["id"])
        self.assertEqual(batch.messages.count(), 0)


# ── payment thank-you signal ─────────────────────────────────────────────

@override_settings(ENABLED_MODULES=["sms", "fees"], SMS_BACKEND="noop",
                   CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class PaymentThankYouTests(TestCase):
    def setUp(self):
        seed_templates()
        self.year = make_academic_year()

    def _pay(self):
        from django.utils import timezone as tz

        from fees.models import Invoice, Payment
        student = make_student(level="FORM1")
        add_guardian(student, phone="0713900001")
        inv = Invoice.objects.create(
            student=student, academic_year=self.year, term="TERM1", quarter="Q1",
            amount_due=Decimal("100000"), amount_paid=0,
            due_date=datetime.date(2026, 6, 1), status="UNPAID")
        # captureOnCommitCallbacks runs the signal's transaction.on_commit hook,
        # which a plain TestCase would otherwise swallow.
        with self.captureOnCommitCallbacks(execute=True):
            payment = Payment.objects.create(
                invoice=inv, amount=Decimal("40000"), payment_method="CASH",
                paid_at=tz.make_aware(datetime.datetime(2026, 5, 1, 9, 0)),
                received_by=make_user(role=Role.BURSAR))
        return payment

    def test_no_sms_when_toggle_off(self):
        cfg = SmsConfiguration.load()
        cfg.auto_payment_thank_you = False
        cfg.save()
        self._pay()
        self.assertEqual(SmsMessage.objects.filter(batch__kind=SmsBatch.Kind.PAYMENT_RECEIVED).count(), 0)

    def test_sms_sent_when_toggle_on(self):
        cfg = SmsConfiguration.load()
        cfg.auto_payment_thank_you = True
        cfg.save()
        self._pay()
        msgs = SmsMessage.objects.filter(batch__kind=SmsBatch.Kind.PAYMENT_RECEIVED)
        self.assertEqual(msgs.count(), 1)
        self.assertEqual(msgs.get().status, SmsMessage.Status.SENT)
        self.assertIn("Tumepokea malipo", msgs.get().body)

    def test_replayed_signal_does_not_double_send(self):
        cfg = SmsConfiguration.load()
        cfg.auto_payment_thank_you = True
        cfg.save()
        payment = self._pay()
        from communications.tasks import send_payment_thank_you_sms
        send_payment_thank_you_sms(payment.pk)  # replay
        self.assertEqual(
            SmsMessage.objects.filter(batch__kind=SmsBatch.Kind.PAYMENT_RECEIVED).count(), 1)


# ── exam results ─────────────────────────────────────────────────────────

@override_settings(ENABLED_MODULES=["sms"], SMS_BACKEND="noop",
                   CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class ExamResultsTests(TestCase):
    def setUp(self):
        seed_templates()
        self.year = make_academic_year()
        self.head = make_user(role=Role.HEADTEACHER)
        self.client = APIClient()
        self.client.force_authenticate(self.head)

    def test_results_summary_and_no_marks_skipped(self):
        from exams.models import Exam, MarkEntry
        subject = make_subject(level_group="OLEVEL")
        exam = Exam.objects.create(
            name="Mid Term", academic_year=self.year, term="TERM1", quarter="Q1",
            level="FORM1", stream="A", exam_type="MIDTERM",
            start_date=datetime.date(2026, 3, 1), end_date=datetime.date(2026, 3, 5),
            created_by=self.head)
        scored = make_student(level="FORM1", stream="A", first_name="Scored")
        blank = make_student(level="FORM1", stream="A", first_name="Blank")
        add_guardian(scored, phone="0713200001")
        add_guardian(blank, phone="0713200002")
        MarkEntry.objects.create(exam=exam, student=scored, subject=subject,
                                 score=Decimal("80"), entered_by=self.head)
        resp = self.client.post("/api/communications/sms/send/",
                                {"kind": "EXAM_RESULTS", "exam_id": exam.pk}, format="json")
        self.assertEqual(resp.status_code, 201)
        batch = SmsBatch.objects.get(pk=resp.data["id"])
        by_name = {m.student.first_name: m for m in batch.messages.all()}
        self.assertEqual(by_name["Scored"].status, SmsMessage.Status.SENT)
        self.assertIn("nafasi 1/1", by_name["Scored"].body)
        self.assertEqual(by_name["Blank"].status, SmsMessage.Status.SKIPPED)
        self.assertIn("no marks", by_name["Blank"].skip_reason)
