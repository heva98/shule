import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def flip_overdue_invoices():
    """
    Flip UNPAID/PARTIAL invoices past their due date to OVERDUE.

    Previously done inline inside DefaultersView.get() on every dashboard
    load — a write (with row locks) piggy-backed on a read endpoint, paid
    for by every user on every page hit regardless of whether anything had
    actually gone overdue. Moved here to run periodically off the request
    path; send_fee_reminders_for_overdue depends on this having already run.
    """
    from .models import Invoice, InvoiceStatus

    today = timezone.now().date()
    updated = (
        Invoice.objects
        .filter(status__in=[InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL], due_date__lt=today)
        .update(status=InvoiceStatus.OVERDUE)
    )
    logger.info('Flipped %d invoice(s) to OVERDUE', updated)
    return {'flipped': updated}
