"""
NotificationService — handles Email, WhatsApp URL generation, and broadcast.

WhatsApp integration: generates wa.me deep-links with pre-filled text.
Full Cloud API integration will be wired in a later phase.

Email integration: uses Django's built-in email backend (configure
EMAIL_* settings in .env for production).
"""

import logging
import urllib.parse
from urllib.parse import quote as url_quote

from django.conf import settings
from django.core.mail import EmailMessage

from .models import DeliveryStatus, Message, MessageLog

logger = logging.getLogger(__name__)


# ── WhatsApp helpers ──────────────────────────────────────────────────────────

def build_whatsapp_url(phone: str, text: str) -> str:
    """
    Return a wa.me deep-link that opens WhatsApp with pre-filled text.
    Phone must be in international format without '+' or spaces, e.g. '255712345678'.
    """
    clean_phone = phone.lstrip('+').replace(' ', '').replace('-', '')
    encoded_text = url_quote(text)
    return f'https://wa.me/{clean_phone}?text={encoded_text}'


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


def _send_whatsapp(
    message_obj: Message,
    phone: str,
    recipient_name: str,
) -> str:
    """
    Generates a wa.me URL and records a MessageLog.
    Returns the URL so the caller can surface it to the frontend.
    """
    wa_url = build_whatsapp_url(phone, message_obj.body)
    log = MessageLog.objects.create(
        message=message_obj,
        recipient_phone=phone,
        recipient_name=recipient_name,
        status=DeliveryStatus.SENT,
        whatsapp_url=wa_url,
        provider_response={'channel': 'whatsapp', 'url_generated': True},
    )
    return wa_url


# ── NotificationService ───────────────────────────────────────────────────────

class NotificationService:

    @staticmethod
    def send_absence_alert(student, date) -> dict:
        """
        Notify the primary guardian that their child was absent.
        Email-only for now — WhatsApp isn't actually wired up to a
        provider yet, so we don't pretend to send it.
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
        Send a fee balance reminder to the student's primary guardian.
        Email-only for now — WhatsApp isn't actually wired up to a
        provider yet, so we don't pretend to send it.
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
        Create an in-app UserNotification for a staff member and optionally
        send WhatsApp + email if contact details are available.
        """
        from accounts.models import UserNotification

        UserNotification.objects.create(
            user=staff_profile.user,
            title=title,
            message=body,
            category=category,
        )

        result = {'success': True, 'wa_url': None}
        user   = staff_profile.user

        if user.phone:
            msg = Message.objects.create(
                subject=title,
                body=body,
                message_type='WHATSAPP',
                audience='INDIVIDUAL',
                sent_by=None,
                total_recipients=1,
            )
            wa_url = _send_whatsapp(msg, user.phone, user.full_name)
            msg.delivered_count = 1
            msg.save(update_fields=['delivered_count'])
            result['wa_url'] = wa_url

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

        return result

    @staticmethod
    def broadcast(message_obj: Message, sent_by_user) -> dict:
        """
        Resolve recipients by audience field, send WhatsApp URL or email
        to each primary guardian contact.
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
        delivered = 0
        wa_urls = []
        wa_logs = []
        is_email = message_obj.message_type == 'EMAIL'

        for student in qs:
            guardian = _primary_guardian(student)
            if not guardian:
                continue

            total += 1

            if is_email and guardian.email:
                # Real SMTP calls are the slow part of a broadcast — hand each
                # one to Celery instead of blocking the request per recipient.
                _queue_email(message_obj, guardian.email, guardian.full_name)

            elif message_obj.message_type in ('WHATSAPP', 'SMS'):
                phone = guardian.whatsapp_phone or guardian.phone
                if phone:
                    wa_url = build_whatsapp_url(phone, message_obj.body)
                    wa_urls.append({'student': student.student_id, 'url': wa_url})
                    wa_logs.append(MessageLog(
                        message=message_obj,
                        recipient_phone=phone,
                        recipient_name=guardian.full_name,
                        status=DeliveryStatus.SENT,
                        whatsapp_url=wa_url,
                        provider_response={'channel': 'whatsapp', 'url_generated': True},
                    ))
                    delivered += 1

        if wa_logs:
            # One INSERT for the whole audience instead of one per recipient.
            MessageLog.objects.bulk_create(wa_logs)

        message_obj.total_recipients = total
        # For email, delivered_count starts at 0 and is incremented by
        # send_email_task as each send actually completes.
        message_obj.delivered_count = 0 if is_email else delivered
        message_obj.save(update_fields=['total_recipients', 'delivered_count'])

        return {
            'total_recipients': total,
            'delivered': message_obj.delivered_count,
            'wa_urls': wa_urls,
        }
