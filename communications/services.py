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
from django.core.mail import send_mail

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


# ── Core send helpers ─────────────────────────────────────────────────────────

def _send_email(
    message_obj: Message,
    to_email: str,
    recipient_name: str,
) -> bool:
    log = MessageLog.objects.create(
        message=message_obj,
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
        return True
    except Exception as exc:
        logger.error('Email failed to %s: %s', to_email, exc)
        log.status = DeliveryStatus.FAILED
        log.provider_response = {'error': str(exc)}
        log.save(update_fields=['status', 'provider_response'])
        return False


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
        Returns {'channel': ..., 'success': bool, 'wa_url': str|None}.
        """
        guardian = student.guardians.filter(is_primary_contact=True).first()
        if not guardian:
            guardian = student.guardians.first()
        if not guardian:
            logger.warning('No guardian for student %s', student.student_id)
            return {'success': False, 'reason': 'no guardian'}

        body = (
            f"Habari {guardian.full_name}, "
            f"mtoto wako {student.first_name} "
            f"hakuhudhuria shule leo {date}. "
            f"Tafadhali wasiliana nasi."
        )

        # Create a transient Message record for logging
        msg = Message.objects.create(
            subject='Absence Alert',
            body=body,
            message_type='WHATSAPP',
            audience='INDIVIDUAL',
            target_student=student,
            sent_by_id=None,     # system-generated; set via service caller if needed
            total_recipients=1,
        )

        result = {'success': False, 'wa_url': None}

        if guardian.whatsapp_phone or guardian.phone:
            phone = guardian.whatsapp_phone or guardian.phone
            wa_url = _send_whatsapp(msg, phone, guardian.full_name)
            msg.delivered_count = 1
            msg.save(update_fields=['delivered_count'])
            result = {'success': True, 'channel': 'whatsapp', 'wa_url': wa_url}

        if guardian.email:
            email_msg = Message.objects.create(
                subject='Absence Notification',
                body=body,
                message_type='EMAIL',
                audience='INDIVIDUAL',
                target_student=student,
                sent_by_id=None,
                total_recipients=1,
            )
            ok = _send_email(email_msg, guardian.email, guardian.full_name)
            if ok:
                email_msg.delivered_count = 1
                email_msg.save(update_fields=['delivered_count'])

        return result

    @staticmethod
    def send_fee_reminder(invoice) -> dict:
        """Send a fee balance reminder to the student's primary guardian."""
        guardian = invoice.student.guardians.filter(is_primary_contact=True).first()
        if not guardian:
            guardian = invoice.student.guardians.first()
        if not guardian:
            return {'success': False, 'reason': 'no guardian'}

        body = (
            f"Dear {guardian.full_name}, "
            f"{invoice.student.first_name} has an "
            f"outstanding fee balance of "
            f"TZS {invoice.balance:,.0f} for "
            f"{invoice.term}. Please pay to avoid "
            f"disruption. Thank you."
        )

        result = {'success': False, 'wa_url': None}

        if guardian.whatsapp_phone or guardian.phone:
            phone = guardian.whatsapp_phone or guardian.phone
            msg = Message.objects.create(
                subject='Fee Reminder',
                body=body,
                message_type='WHATSAPP',
                audience='INDIVIDUAL',
                target_student=invoice.student,
                sent_by_id=None,
                total_recipients=1,
            )
            wa_url = _send_whatsapp(msg, phone, guardian.full_name)
            msg.delivered_count = 1
            msg.save(update_fields=['delivered_count'])
            result = {'success': True, 'channel': 'whatsapp', 'wa_url': wa_url}

        if guardian.email:
            email_msg = Message.objects.create(
                subject='Fee Reminder',
                body=body,
                message_type='EMAIL',
                audience='INDIVIDUAL',
                target_student=invoice.student,
                sent_by_id=None,
                total_recipients=1,
            )
            ok = _send_email(email_msg, guardian.email, guardian.full_name)
            if ok:
                email_msg.delivered_count = 1
                email_msg.save(update_fields=['delivered_count'])

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

        for student in qs:
            guardian = (
                student.guardians.filter(is_primary_contact=True).first()
                or student.guardians.first()
            )
            if not guardian:
                continue

            total += 1

            if message_obj.message_type == 'EMAIL' and guardian.email:
                ok = _send_email(message_obj, guardian.email, guardian.full_name)
                if ok:
                    delivered += 1

            elif message_obj.message_type in ('WHATSAPP', 'SMS'):
                phone = guardian.whatsapp_phone or guardian.phone
                if phone:
                    wa_url = _send_whatsapp(message_obj, phone, guardian.full_name)
                    wa_urls.append({'student': student.student_id, 'url': wa_url})
                    delivered += 1

        message_obj.total_recipients = total
        message_obj.delivered_count = delivered
        message_obj.save(update_fields=['total_recipients', 'delivered_count'])

        return {
            'total_recipients': total,
            'delivered': delivered,
            'wa_urls': wa_urls,
        }
