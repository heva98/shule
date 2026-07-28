import logging
from celery import shared_task
from django.db.models import F
from django.utils import timezone

logger = logging.getLogger(__name__)


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
    fire a WhatsApp / email notification per student,
    then mark sms_sent=True.

    Scheduled via django-celery-beat to run at 09:00 Africa/Dar_es_Salaam daily.
    """
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
