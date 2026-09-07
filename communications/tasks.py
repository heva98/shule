import logging
from celery import shared_task
from django.conf import settings
from django.db.models import F
from django.utils import timezone

logger = logging.getLogger(__name__)


# ── SMS ─────────────────────────────────────────────────────────────────────

def _sms_enabled() -> bool:
    from shule.modules import module_enabled
    return module_enabled("sms")


@shared_task(bind=True, max_retries=5, default_retry_delay=60, acks_late=True)
def run_sms_batch(self, batch_id):
    """
    Deliver an SmsBatch. Idempotent — `send_batch` only touches rows still
    PENDING, so a retry after a provider/network wobble resumes without
    re-sending anything already accepted by the provider.
    """
    from .models import SmsBatch
    from .sms_service import send_batch

    if not _sms_enabled():
        logger.warning("run_sms_batch(%s): sms module disabled — not sending", batch_id)
        return {"batch": batch_id, "skipped": "sms module disabled"}

    try:
        batch = SmsBatch.objects.get(pk=batch_id)
    except SmsBatch.DoesNotExist:
        return {"batch": batch_id, "error": "not found"}

    if batch.dry_run:
        return {"batch": batch_id, "skipped": "dry-run"}

    try:
        return send_batch(batch_id)
    except Exception as exc:  # transport-level failure of the whole run
        logger.exception("run_sms_batch(%s) failed", batch_id)
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            SmsBatch.objects.filter(pk=batch_id).update(status=SmsBatch.Status.FAILED)
            return {"batch": batch_id, "error": str(exc)}


@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def send_payment_thank_you_sms(self, payment_id):
    """
    Fired from the fees.Payment post_save signal. Every guard is re-checked
    here so a replayed signal / task retry cannot double-send.
    """
    from fees.models import Payment

    from .models import SmsBatch, SmsConfiguration, SmsTemplateKey
    from .sms_audiences import payment_thank_you_recipients
    from .sms_service import create_batch, send_batch

    if not _sms_enabled():
        return {"skipped": "sms module disabled"}

    cfg = SmsConfiguration.load()
    if not cfg.auto_payment_thank_you:
        return {"skipped": "auto_payment_thank_you is off"}

    try:
        payment = Payment.objects.select_related("invoice__student").get(pk=payment_id)
    except Payment.DoesNotExist:
        return {"skipped": "payment gone"}

    batch = create_batch(
        kind=SmsBatch.Kind.PAYMENT_RECEIVED,
        template_key=SmsTemplateKey.PAYMENT_RECEIVED,
        recipients=payment_thank_you_recipients(payment),
        base_context={},
        idempotency_key=f"payment-{payment_id}",
    )
    if batch.status == SmsBatch.Status.QUEUED:
        return send_batch(batch.pk)
    return {"batch": batch.pk, "status": batch.status, "note": "already handled"}


@shared_task
def sms_term_date_run():
    """
    Daily. For the current academic year, text closing / opening reminders 5
    days and 1 day before each quarter boundary. Each (boundary, offset) send
    is idempotent via the batch idempotency key.
    """
    from fees.models import AcademicYear, Term
    from shule.utils import TERM_QUARTER_MAP

    from .models import SmsBatch, SmsConfiguration, SmsTemplateKey
    from .sms_audiences import term_dates_recipients
    from .sms_service import create_batch, dispatch_batch

    if not _sms_enabled():
        return {"skipped": "sms module disabled"}
    if not SmsConfiguration.load().auto_term_dates:
        return {"skipped": "auto_term_dates is off"}

    year = AcademicYear.objects.filter(is_current=True).first()
    if not year:
        return {"skipped": "no current academic year"}

    today = timezone.localdate()
    term_label = dict(Term.choices)
    quarters = ["Q1", "Q2", "Q3", "Q4"]
    starts = {q: getattr(year, f"{q.lower()}_start") for q in quarters}
    ends = {q: getattr(year, f"{q.lower()}_end") for q in quarters}
    sent = []

    for offset in (5, 1):
        for idx, q in enumerate(quarters):
            tlabel = term_label.get(TERM_QUARTER_MAP.get(q), q)

            open_date = starts.get(q)
            if open_date and (open_date - today).days == offset:
                batch = create_batch(
                    kind=SmsBatch.Kind.TERM_DATES,
                    template_key=SmsTemplateKey.TERM_OPENING,
                    recipients=term_dates_recipients(
                        boundary="start", term_label=tlabel, opening_date=open_date),
                    base_context={},
                    idempotency_key=f"term-{year.pk}-{q}-start-{offset}",
                )
                dispatch_batch(batch)
                sent.append(batch.pk)

            close_date = ends.get(q)
            next_open = starts.get(quarters[idx + 1]) if idx + 1 < len(quarters) else None
            if close_date and next_open and (close_date - today).days == offset:
                batch = create_batch(
                    kind=SmsBatch.Kind.TERM_DATES,
                    template_key=SmsTemplateKey.TERM_CLOSING,
                    recipients=term_dates_recipients(
                        boundary="end", term_label=tlabel,
                        closing_date=close_date, opening_date=next_open),
                    base_context={},
                    idempotency_key=f"term-{year.pk}-{q}-end-{offset}",
                )
                dispatch_batch(batch)
                sent.append(batch.pk)

    return {"batches": sent}


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_email_task(self, message_id, to_email, recipient_name):
    """
    Send a single email for an existing Message and record the result on a
    MessageLog row. Runs off the request/loop thread — SMTP is the slow,
    failure-prone part of any bulk notification, so every caller in
    services.py (broadcast, absence alerts, fee reminders, staff notify)
    enqueues this instead of calling send_mail() inline.
    """
    from django.conf import settings
    from django.core.mail import send_mail

    from .models import DeliveryStatus, Message, MessageLog

    message_obj = Message.objects.get(pk=message_id)
    log = MessageLog.objects.create(
        message_id=message_id,
        recipient_email=to_email,
        recipient_name=recipient_name,
        status=DeliveryStatus.PENDING,
    )
    try:
        send_mail(
            subject=message_obj.subject or 'Shule Notification',
            message=message_obj.body,
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@shule.ac.tz'),
            recipient_list=[to_email],
            fail_silently=False,
        )
        log.status = DeliveryStatus.SENT
        log.provider_response = {'channel': 'email', 'to': to_email}
        log.save(update_fields=['status', 'provider_response'])
        Message.objects.filter(pk=message_id).update(delivered_count=F('delivered_count') + 1)
        return {'sent': True}
    except Exception as exc:
        logger.error('Email failed to %s: %s', to_email, exc)
        log.status = DeliveryStatus.FAILED
        log.provider_response = {'error': str(exc)}
        log.save(update_fields=['status', 'provider_response'])
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            return {'sent': False}


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_daily_absence_alerts(self):
    """
    Fetch all AbsenceAlerts for today where sms_sent=False,
    email a notification to each student's guardian,
    then mark sms_sent=True.

    Scheduled via django-celery-beat to run at 09:00 Africa/Dar_es_Salaam daily.
    """
    if 'attendance' not in settings.ENABLED_MODULES:
        return {'sent': 0, 'failed': 0, 'skipped': 'attendance module disabled'}

    from attendance.models import AbsenceAlert
    from .services import NotificationService

    today = timezone.localdate()
    alerts = AbsenceAlert.objects.filter(date=today, sms_sent=False).select_related(
        'student'
    ).prefetch_related('student__guardians')

    sent_ids = []
    failed = 0

    for alert in alerts:
        try:
            result = NotificationService.send_absence_alert(alert.student, today)
            if result.get('success'):
                sent_ids.append(alert.pk)
            else:
                failed += 1
                logger.warning(
                    'Absence alert failed for %s: %s',
                    alert.student.student_id,
                    result.get('reason'),
                )
        except Exception as exc:
            failed += 1
            logger.error(
                'Exception sending absence alert for %s: %s',
                alert.student.student_id,
                exc,
            )
            try:
                raise self.retry(exc=exc)
            except self.MaxRetriesExceededError:
                pass

    if sent_ids:
        # One UPDATE for every alert sent in this run instead of one per row.
        AbsenceAlert.objects.filter(pk__in=sent_ids).update(
            sms_sent=True, sent_at=timezone.now()
        )

    sent = len(sent_ids)
    logger.info('Absence alerts: %d sent, %d failed for %s', sent, failed, today)
    return {'sent': sent, 'failed': failed, 'date': str(today)}


@shared_task
def send_fee_reminders_for_overdue():
    """
    Send fee reminders for all OVERDUE invoices.
    Intended to be scheduled weekly by celery-beat.
    """
    if 'fees' not in settings.ENABLED_MODULES:
        return {'sent': 0, 'skipped': 'fees module disabled'}

    from fees.models import Invoice, InvoiceStatus
    from .services import NotificationService

    invoices = Invoice.objects.filter(
        status=InvoiceStatus.OVERDUE
    ).select_related('student').prefetch_related('student__guardians')

    sent = 0
    for invoice in invoices:
        result = NotificationService.send_fee_reminder(invoice)
        if result.get('success'):
            sent += 1

    logger.info('Fee reminders sent: %d', sent)
    return {'sent': sent}
