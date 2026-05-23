import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


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
    )

    sent = 0
    failed = 0

    for alert in alerts:
        try:
            result = NotificationService.send_absence_alert(alert.student, today)
            if result.get('success'):
                alert.sms_sent = True
                alert.sent_at = timezone.now()
                alert.save(update_fields=['sms_sent', 'sent_at'])
                sent += 1
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
