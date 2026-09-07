"""
NotificationService — email notifications and broadcast.

Email integration: uses Django's built-in email backend (configure
EMAIL_* settings in .env for production). Bulk SMS to parents lives in the
separate `sms_service` module.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMessage

from .models import Message

logger = logging.getLogger(__name__)


def notify_demo_request(demo_request) -> bool:
    """
    Email the configured owner inbox with the details of a public
    "Request a demo" submission. Never raises — a delivery failure
    shouldn't turn into a 500 for the visitor who just submitted the form.
    """
    body = (
        f'New demo request from the Shule SMS landing page.\n\n'
        f'Name: {demo_request.full_name}\n'
        f'Email: {demo_request.email}\n'
        f'Phone: {demo_request.phone or "—"}\n'
        f'School: {demo_request.school_name or "—"}\n'
        f'Message: {demo_request.message or "—"}\n'
        f'Submitted: {demo_request.created_at:%Y-%m-%d %H:%M}\n'
    )
    try:
        email = EmailMessage(
            subject=f'New demo request — {demo_request.full_name}',
            body=body,
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@shule.ac.tz'),
            to=[settings.DEMO_REQUEST_NOTIFY_EMAIL],
            reply_to=[demo_request.email],
        )
        email.send(fail_silently=False)
        return True
    except Exception as exc:
        logger.error('Demo request notification email failed: %s', exc)
        return False


# ── Core send helpers ─────────────────────────────────────────────────────────

def _queue_email(message_obj: Message, to_email: str, recipient_name: str) -> None:
    """
    Hand an email off to Celery instead of blocking the request/loop on SMTP.
    Fire-and-forget: delivery success/failure is recorded on the MessageLog
    and reconciled onto Message.delivered_count by the task itself.
    """
    from .tasks import send_email_task
    send_email_task.delay(message_obj.pk, to_email, recipient_name)


def _primary_guardian(student):
    """
    Pick the primary guardian (or first available) from an ALREADY-FETCHED
    `student.guardians` relation. Calling code must have prefetched
    'guardians' (or 'student__guardians') — using `.all()` here reuses that
    cache instead of issuing a fresh query, unlike `.filter(...).first()`
    which always hits the DB even when the relation was prefetched.
    """
    guardians = list(student.guardians.all())
    if not guardians:
        return None
    for guardian in guardians:
        if guardian.is_primary_contact:
            return guardian
    return guardians[0]


# ── NotificationService ───────────────────────────────────────────────────────

class NotificationService:

    @staticmethod
    def send_absence_alert(student, date) -> dict:
        """
        Notify the primary guardian by email that their child was absent.
        Returns {'success': bool, 'channel': 'email'|None}.
        """
        guardian = _primary_guardian(student)
        if not guardian:
            logger.warning('No guardian for student %s', student.student_id)
            return {'success': False, 'reason': 'no guardian'}

        body = (
            f"Habari {guardian.full_name}, "
            f"mtoto wako {student.first_name} "
            f"hakuhudhuria shule leo {date}. "
            f"Tafadhali wasiliana nasi."
        )

        if not guardian.email:
            return {'success': False, 'reason': 'no email on file'}

        email_msg = Message.objects.create(
            subject='Absence Notification',
            body=body,
            message_type='EMAIL',
            audience='INDIVIDUAL',
            target_student=student,
            sent_by_id=None,
            total_recipients=1,
        )
        _queue_email(email_msg, guardian.email, guardian.full_name)

        return {'success': True, 'channel': 'email'}

    @staticmethod
    def send_fee_reminder(invoice) -> dict:
        """
        Email a fee balance reminder to the student's primary guardian.
        """
        guardian = _primary_guardian(invoice.student)
        if not guardian:
            return {'success': False, 'reason': 'no guardian'}

        if not guardian.email:
            return {'success': False, 'reason': 'no email on file'}

        body = (
            f"Dear {guardian.full_name}, "
            f"{invoice.student.first_name} has an "
            f"outstanding fee balance of "
            f"TZS {invoice.balance:,.0f} for "
            f"{invoice.term}. Please pay to avoid "
            f"disruption. Thank you."
        )

        email_msg = Message.objects.create(
            subject='Fee Reminder',
            body=body,
            message_type='EMAIL',
            audience='INDIVIDUAL',
            target_student=invoice.student,
            sent_by_id=None,
            total_recipients=1,
        )
        _queue_email(email_msg, guardian.email, guardian.full_name)

        return {'success': True, 'channel': 'email'}

    @staticmethod
    def notify_staff(staff_profile, title: str, body: str, category: str = 'GENERAL') -> dict:
        """
        Create an in-app UserNotification for a staff member and also email
        them if an address is on file.
        """
        from accounts.models import UserNotification

        UserNotification.objects.create(
            user=staff_profile.user,
            title=title,
            message=body,
            category=category,
        )

        user = staff_profile.user
        if user.email:
            email_msg = Message.objects.create(
                subject=title,
                body=body,
                message_type='EMAIL',
                audience='INDIVIDUAL',
                sent_by=None,
                total_recipients=1,
            )
            _queue_email(email_msg, user.email, user.full_name)

        return {'success': True}

    @staticmethod
    def broadcast(message_obj: Message, sent_by_user) -> dict:
        """
        Resolve recipients by audience field and email each primary guardian.
        Returns a summary dict.
        """
        from students.models import Student, StudentStatus

        qs = Student.objects.filter(status=StudentStatus.ACTIVE).prefetch_related('guardians')

        if message_obj.audience == 'LEVEL' and message_obj.target_level:
            qs = qs.filter(level=message_obj.target_level)
        elif message_obj.audience == 'CLASS':
            if message_obj.target_level:
                qs = qs.filter(level=message_obj.target_level)
            if message_obj.target_stream:
                qs = qs.filter(stream__iexact=message_obj.target_stream)
        elif message_obj.audience == 'INDIVIDUAL' and message_obj.target_student:
            qs = qs.filter(pk=message_obj.target_student_id)

        total = 0

        for student in qs:
            guardian = _primary_guardian(student)
            if not guardian:
                continue

            total += 1

            if guardian.email:
                # Real SMTP calls are the slow part of a broadcast — hand each
                # one to Celery instead of blocking the request per recipient.
                _queue_email(message_obj, guardian.email, guardian.full_name)

        message_obj.total_recipients = total
        # delivered_count starts at 0 and is incremented by send_email_task as
        # each send actually completes.
        message_obj.delivered_count = 0
        message_obj.save(update_fields=['total_recipients', 'delivered_count'])

        return {
            'total_recipients': total,
            'delivered': 0,
        }
