"""
Automatic "payment received" SMS.

A no-op unless the school has ticked SmsConfiguration.auto_payment_thank_you
*and* the `sms` module is enabled. The handler only enqueues a Celery task with
the payment id; every guard (module, toggle, opt-out, phone validity,
idempotency) is re-checked inside the task so a replayed signal can't
double-send.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender="fees.Payment", dispatch_uid="communications_payment_thank_you")
def payment_thank_you_sms(sender, instance, created, **kwargs):
    if not created:
        return

    from shule.modules import module_enabled
    if not module_enabled("sms"):
        return

    try:
        from .models import SmsConfiguration
        if not SmsConfiguration.load().auto_payment_thank_you:
            return
    except Exception:  # DB not migrated yet, etc. — never break a payment save
        logger.exception("payment_thank_you_sms: could not load SmsConfiguration")
        return

    from .tasks import send_payment_thank_you_sms

    def _enqueue():
        send_payment_thank_you_sms.delay(instance.pk)

    # Wait until the payment (and its post_save receipt-number update) is
    # committed so the task re-reads a complete row.
    from django.db import transaction
    transaction.on_commit(_enqueue)
