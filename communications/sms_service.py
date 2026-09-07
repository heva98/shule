"""
SMS orchestration: resolve an audience, render per-recipient bodies, persist an
auditable SmsBatch of SmsMessage rows, and (unless dry-run) queue delivery.

Guard order for every recipient — first failing guard wins and the row is
recorded SKIPPED with a reason, never silently dropped:
    1. guardian opted out
    2. no valid Tanzanian mobile number
    3. duplicate (phone, pupil) already in this batch
    4. a template placeholder has no value
    5. rendered body exceeds the segment cap
"""

import logging
from dataclasses import dataclass, field
from decimal import Decimal

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.utils.formats import date_format

from shule.phone import is_tz_mobile, normalize_tz_phone
from students.models import Level

from .models import (
    SmsBatch,
    SmsConfiguration,
    SmsMessage,
    SmsTemplateKey,
)
from .sms_backends import get_sms_backend
from .sms_segments import count_segments, price_per_segment
from .sms_templates import MissingPlaceholder, TemplateSyntaxError, get_active_template, render

logger = logging.getLogger(__name__)

_LEVEL_LABEL = dict(Level.choices)


class SmsError(Exception):
    """Something the caller can fix — bad audience, missing template, over the cap."""


@dataclass
class Recipient:
    context: dict
    student: object | None = None
    guardian: object | None = None
    phone: str = ""
    # Optional per-recipient template (e.g. fee reminders pick DUE vs OVERDUE
    # per pupil). Falls back to the batch's template_key when blank.
    template_key: str = ""
    # Resolver-supplied reason to skip this recipient outright (no marks, no
    # guardian, …) — recorded verbatim as the skip reason.
    force_skip: str = ""


@dataclass
class Preview:
    kind: str
    template_key: str
    language: str
    would_send: int = 0
    skipped: int = 0
    skip_breakdown: dict = field(default_factory=dict)
    total_segments: int = 0
    estimated_cost: str = "0"
    price_per_segment: str = "0"
    sample: list = field(default_factory=list)


# ── helpers ────────────────────────────────────────────────────────────────

def class_label(level: str, stream: str = "") -> str:
    base = _LEVEL_LABEL.get(level, level)
    return f"{base} {stream}".strip().upper() if stream else base


def _fmt_date(value) -> str:
    return date_format(value, "j M Y") if value else ""


def _fmt_money(value) -> str:
    try:
        return f"{Decimal(str(value)):,.0f}"
    except Exception:
        return str(value)


def primary_guardian(student):
    """Primary contact, else first — from a prefetched `guardians` relation."""
    guardians = list(student.guardians.all())
    if not guardians:
        return None
    for g in guardians:
        if g.is_primary_contact:
            return g
    return guardians[0]


def _school_name() -> str:
    from accounts.models import SchoolSettings
    return SchoolSettings.get_settings().school_name


def _school_contact() -> str:
    """Phone (or email) parents can call for help — used in fee-reminder copy."""
    from accounts.models import SchoolSettings
    s = SchoolSettings.get_settings()
    return (s.school_phone or s.school_email or "").strip()


def resolve_language(language: str, cfg=None) -> str:
    """A caller-supplied language if it's a valid choice, else the school default."""
    from .models import SmsConfiguration, SmsLanguage
    cfg = cfg or SmsConfiguration.load()
    lang = (language or "").strip().upper()
    return lang if lang in SmsLanguage.values else cfg.language


def _load_language_templates(language: str) -> dict[str, str]:
    from .models import SmsTemplate
    return {
        t.key: t.body
        for t in SmsTemplate.objects.filter(language=language, is_active=True)
    }


# ── batch construction ─────────────────────────────────────────────────────

def _evaluate(recipient: Recipient, templates: dict, default_key: str,
              base_context: dict, seen: set, max_segments: int):
    """Return (status, skip_reason, phone, body, segments, template_key)."""
    guardian = recipient.guardian
    raw_phone = recipient.phone or (guardian.phone if guardian else "")
    tkey = recipient.template_key or default_key
    template_body = templates.get(tkey)

    if recipient.force_skip:
        return SmsMessage.Status.SKIPPED, recipient.force_skip, "", "", 0, tkey

    if template_body is None:
        return SmsMessage.Status.SKIPPED, f"no active '{tkey}' template", "", "", 0, tkey

    if guardian is not None and guardian.sms_opt_out:
        return SmsMessage.Status.SKIPPED, "guardian opted out of SMS", "", "", 0, tkey

    phone = normalize_tz_phone(raw_phone)
    if not is_tz_mobile(phone):
        shown = raw_phone or "blank"
        return SmsMessage.Status.SKIPPED, f"no valid mobile number ({shown})", "", "", 0, tkey

    dedupe_key = (phone, recipient.student.pk if recipient.student else None)
    if dedupe_key in seen:
        return SmsMessage.Status.SKIPPED, "duplicate recipient already in this batch", "", "", 0, tkey

    context = {**base_context, **recipient.context}
    try:
        body = render(template_body, context)
    except MissingPlaceholder as exc:
        return SmsMessage.Status.SKIPPED, f"template value missing: {{{exc.name}}}", phone, "", 0, tkey

    segments = count_segments(body)
    if segments > max_segments:
        return (SmsMessage.Status.SKIPPED,
                f"{segments} segments exceeds the limit of {max_segments}", phone, body, segments, tkey)

    seen.add(dedupe_key)
    return SmsMessage.Status.PENDING, "", phone, body, segments, tkey


def recount(batch: SmsBatch) -> None:
    agg = batch.messages.aggregate(
        total=Count("id"),
        sent=Count("id", filter=Q(status__in=[SmsMessage.Status.SENT, SmsMessage.Status.DELIVERED])),
        failed=Count("id", filter=Q(status=SmsMessage.Status.FAILED)),
        skipped=Count("id", filter=Q(status=SmsMessage.Status.SKIPPED)),
        segments=Sum("segments", filter=~Q(status=SmsMessage.Status.SKIPPED)),
        cost=Sum("cost", filter=~Q(status=SmsMessage.Status.SKIPPED)),
    )
    batch.total_recipients = agg["total"] or 0
    batch.sent_count = agg["sent"] or 0
    batch.failed_count = agg["failed"] or 0
    batch.skipped_count = agg["skipped"] or 0
    batch.total_segments = agg["segments"] or 0
    batch.total_cost = agg["cost"] or Decimal("0")
    batch.save(update_fields=[
        "total_recipients", "sent_count", "failed_count", "skipped_count",
        "total_segments", "total_cost",
    ])


def preview_recipients(*, kind: str, template_key: str, recipients: list[Recipient],
                       base_context: dict | None = None, sample_size: int = 3,
                       language: str = "") -> Preview:
    cfg = SmsConfiguration.load()
    lang = resolve_language(language, cfg)
    templates = _load_language_templates(lang)
    if template_key not in templates:
        raise SmsError(f"No active '{template_key}' template for language {lang}.")
    base_context = base_context or {}
    max_segments = cfg.effective_max_segments

    pv = Preview(kind=kind, template_key=template_key, language=lang,
                 price_per_segment=str(price_per_segment()))
    seen: set = set()
    total_segments = 0
    for rec in recipients:
        status, reason, _phone, body, segments, _tkey = _evaluate(
            rec, templates, template_key, base_context, seen, max_segments)
        if status == SmsMessage.Status.PENDING:
            pv.would_send += 1
            total_segments += segments
            if len(pv.sample) < sample_size:
                pv.sample.append({"to_name": rec.guardian.full_name if rec.guardian else "",
                                  "body": body, "segments": segments})
        else:
            pv.skipped += 1
            pv.skip_breakdown[reason] = pv.skip_breakdown.get(reason, 0) + 1
    pv.total_segments = total_segments
    pv.estimated_cost = str(price_per_segment() * total_segments)
    return pv


def create_batch(*, kind: str, template_key: str, recipients: list[Recipient],
                 created_by=None, base_context: dict | None = None,
                 dry_run: bool = False, idempotency_key: str = "",
                 language: str = "") -> SmsBatch:
    cfg = SmsConfiguration.load()
    lang = resolve_language(language, cfg)
    templates = _load_language_templates(lang)
    template = get_active_template(template_key, lang)
    if template is None or template_key not in templates:
        raise SmsError(f"No active '{template_key}' template for language {lang}.")

    if idempotency_key:
        existing = SmsBatch.objects.filter(idempotency_key=idempotency_key).first()
        if existing:
            return existing

    base_context = base_context or {}
    cap = cfg.effective_recipient_cap
    if len(recipients) > cap:
        raise SmsError(
            f"{len(recipients)} recipients exceeds this school's per-batch cap of {cap}. "
            f"Narrow the audience or raise SMS_BATCH_RECIPIENT_CAP."
        )
    max_segments = cfg.effective_max_segments
    sender_id = settings.NOTIFY_AFRICA_SENDER_ID or ""
    unit_cost = price_per_segment()

    from .sms_templates import placeholders as _placeholders
    for tkey, body in templates.items():
        try:
            _placeholders(body)  # raises TemplateSyntaxError on unbalanced braces
        except TemplateSyntaxError as exc:
            raise SmsError(f"Template '{tkey}' has a syntax error: {exc}") from exc

    try:
        with transaction.atomic():
            batch = _build_batch(
                kind=kind, template=template, template_key=template_key, language=lang,
                sender_id=sender_id, created_by=created_by, base_context=base_context,
                dry_run=dry_run, idempotency_key=idempotency_key,
                recipients=recipients, templates=templates, max_segments=max_segments,
                unit_cost=unit_cost,
            )
    except IntegrityError:
        # Concurrent automatic send with the same idempotency key won the race.
        if idempotency_key:
            existing = SmsBatch.objects.filter(idempotency_key=idempotency_key).first()
            if existing:
                return existing
        raise
    return batch


def _build_batch(*, kind, template, template_key, language, sender_id, created_by,
                 base_context, dry_run, idempotency_key, recipients, templates,
                 max_segments, unit_cost) -> SmsBatch:
    """Persist the batch + one SmsMessage per recipient. Runs inside a transaction."""
    batch = SmsBatch.objects.create(
        kind=kind, template=template, template_key=template_key, language=language,
        sender_id=sender_id, created_by=created_by, context=base_context,
        dry_run=dry_run, idempotency_key=idempotency_key or "",
        status=SmsBatch.Status.PENDING,
    )
    seen: set = set()
    rows: list[SmsMessage] = []
    for rec in recipients:
        status, reason, phone, body, segments, _tkey = _evaluate(
            rec, templates, template_key, base_context, seen, max_segments)
        rows.append(SmsMessage(
            batch=batch,
            student=rec.student,
            guardian=rec.guardian,
            recipient_name=(rec.guardian.full_name if rec.guardian else ""),
            recipient_phone=phone if status == SmsMessage.Status.PENDING else "",
            body=body,
            sender_id=sender_id,
            status=status,
            skip_reason=reason,
            segments=segments,
            cost=(unit_cost * segments if status == SmsMessage.Status.PENDING else Decimal("0")),
            sent_by=created_by,
        ))
    SmsMessage.objects.bulk_create(rows)
    recount(batch)

    # Dispatch is the caller's job (view / task) — `create_batch` runs in its own
    # committed transaction, so a QUEUED batch it returns is safe to hand
    # straight to run_sms_batch.delay().
    if not dry_run and batch.messages.filter(status=SmsMessage.Status.PENDING).exists():
        batch.status = SmsBatch.Status.QUEUED
        batch.queued_at = timezone.now()
        batch.save(update_fields=["status", "queued_at"])
    return batch


def dispatch_batch(batch: SmsBatch) -> None:
    """Queue a QUEUED batch for delivery (no-op for dry-run / nothing pending)."""
    if batch.dry_run or batch.status != SmsBatch.Status.QUEUED:
        return
    from .tasks import run_sms_batch
    run_sms_batch.delay(batch.pk)


# ── delivery ───────────────────────────────────────────────────────────────

def send_batch(batch_id: int, *, chunk_size: int | None = None,
               sleep_between: float | None = None) -> dict:
    """
    Deliver a batch's PENDING rows. Idempotent: rows already SENT are never
    re-sent, so a Celery retry after a mid-run failure resumes cleanly.
    """
    import time

    batch = SmsBatch.objects.get(pk=batch_id)
    if batch.dry_run:
        return {"batch": batch_id, "skipped": "dry-run batch is never delivered"}
    if batch.status == SmsBatch.Status.COMPLETED:
        return {"batch": batch_id, "noop": "already completed"}

    chunk_size = chunk_size or settings.SMS_PROVIDER_CHUNK_SIZE
    sleep_between = settings.SMS_PROVIDER_CHUNK_SLEEP if sleep_between is None else sleep_between

    backend = get_sms_backend()
    batch.status = SmsBatch.Status.RUNNING
    batch.save(update_fields=["status"])

    processed = 0
    pending_ids = list(
        batch.messages.filter(status=SmsMessage.Status.PENDING).order_by("id").values_list("id", flat=True)
    )
    for start in range(0, len(pending_ids), chunk_size):
        chunk = pending_ids[start:start + chunk_size]
        for msg in SmsMessage.objects.filter(id__in=chunk):
            if msg.status != SmsMessage.Status.PENDING:
                continue
            result = backend.send_one(
                to=msg.recipient_phone, body=msg.body, sender_id=batch.sender_id or msg.sender_id
            )
            if result.ok:
                msg.status = SmsMessage.Status.SENT
                msg.provider_message_id = result.provider_message_id
                msg.provider_status = result.provider_status
                msg.error_detail = ""
                msg.sent_at = timezone.now()
            else:
                msg.status = SmsMessage.Status.FAILED
                msg.provider_status = result.provider_status
                msg.error_detail = (result.error or "")[:500]
            msg.provider_response = result.raw or {}
            msg.save(update_fields=[
                "status", "provider_message_id", "provider_status",
                "error_detail", "provider_response", "sent_at", "updated_at",
            ])
            processed += 1
        if sleep_between and start + chunk_size < len(pending_ids):
            time.sleep(sleep_between)

    recount(batch)
    batch.refresh_from_db()
    if batch.sent_count == 0 and batch.failed_count > 0:
        batch.status = SmsBatch.Status.FAILED
    else:
        batch.status = SmsBatch.Status.COMPLETED
    batch.completed_at = timezone.now()
    batch.save(update_fields=["status", "completed_at"])

    return {
        "batch": batch_id, "processed": processed,
        "sent": batch.sent_count, "failed": batch.failed_count, "skipped": batch.skipped_count,
        "segments": batch.total_segments, "cost": str(batch.total_cost),
    }


def requeue_failed(batch: SmsBatch) -> int:
    """Flip this batch's FAILED rows back to PENDING for another delivery pass."""
    n = batch.messages.filter(status=SmsMessage.Status.FAILED).update(
        status=SmsMessage.Status.PENDING, error_detail="", provider_status="", updated_at=timezone.now(),
    )
    if n:
        batch.status = SmsBatch.Status.QUEUED
        batch.queued_at = timezone.now()
        batch.save(update_fields=["status", "queued_at"])
    return n
