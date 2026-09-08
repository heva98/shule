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


@shared_task
def sync_student_charges(student_id):
    """Re-run the assignment engine for one student across every current
    academic year: annual charges, plus every quarterly period already opened
    for that year. Fired (debounced via on_commit) whenever a student, their
    boarding placement or their transport route changes."""
    from django.conf import settings

    if 'fees' not in settings.ENABLED_MODULES:
        return {'skipped': 'fees module disabled'}

    from students.models import Student, StudentStatus
    from .charges import blank_stats, finalize, generate_for_student
    from .models import AcademicYear, Invoice, InvoiceKind

    try:
        student = Student.objects.get(pk=student_id)
    except Student.DoesNotExist:
        return {'skipped': 'student gone'}
    if student.status != StudentStatus.ACTIVE:
        return {'skipped': 'student not active'}

    stats = blank_stats()
    for year in AcademicYear.objects.filter(is_current=True):
        generate_for_student(student, year, scope=InvoiceKind.ANNUAL, stats=stats)
        opened = (
            Invoice.objects
            .filter(academic_year=year, kind=InvoiceKind.QUARTERLY)
            .values_list('term', 'quarter')
            .distinct()
        )
        for term, quarter in opened:
            generate_for_student(
                student, year, scope=InvoiceKind.QUARTERLY,
                term=term, quarter=quarter, stats=stats,
            )
    result = finalize(stats)
    logger.info('sync_student_charges(%s): %s', student_id, result)
    return result


@shared_task
def resync_current_charges():
    """Nightly safety net: re-sync every active student so configuration
    changes that missed a signal still land."""
    from django.conf import settings

    if 'fees' not in settings.ENABLED_MODULES:
        return {'skipped': 'fees module disabled'}

    from students.models import Student, StudentStatus

    ids = list(
        Student.objects.filter(status=StudentStatus.ACTIVE).values_list('pk', flat=True)
    )
    for sid in ids:
        sync_student_charges.run(sid)
    return {'students': len(ids)}
