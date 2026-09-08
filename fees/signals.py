"""Keep a student's charges in step with enrolment changes (edge cases
1-4, 15-20). Everything is debounced onto a Celery task that fires after the
surrounding transaction commits, and every guard is re-checked inside the task
so a replayed signal is harmless."""

import logging

from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _enqueue(student_id):
    if not student_id or 'fees' not in settings.ENABLED_MODULES:
        return
    from .tasks import sync_student_charges

    def _fire():
        try:
            sync_student_charges.delay(student_id)
        except Exception:  # broker down — the nightly resync is the safety net
            logger.warning('could not enqueue sync_student_charges(%s)', student_id, exc_info=True)

    transaction.on_commit(_fire)


@receiver(post_save, sender='students.Student', dispatch_uid='fees_sync_on_student_save')
def _on_student_saved(sender, instance, **kwargs):
    from students.models import StudentStatus

    if instance.status == StudentStatus.ACTIVE:
        _enqueue(instance.pk)


@receiver(post_save, sender='boarding.BoardingAssignment', dispatch_uid='fees_sync_on_boarding_save')
@receiver(post_delete, sender='boarding.BoardingAssignment', dispatch_uid='fees_sync_on_boarding_delete')
@receiver(post_save, sender='transport.TransportAssignment', dispatch_uid='fees_sync_on_transport_save')
@receiver(post_delete, sender='transport.TransportAssignment', dispatch_uid='fees_sync_on_transport_delete')
def _on_assignment_changed(sender, instance, **kwargs):
    _enqueue(instance.student_id)
