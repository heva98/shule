"""
Audience resolvers — turn a request ("this exam", "arrears in Form 2", "term
closing") into a list of `Recipient` objects with their per-pupil placeholder
context. Nothing here sends or persists; `sms_service.create_batch` /
`preview_recipients` do that.

Per the agreed rules:
  * one SMS per pupil — a contact with two children gets two messages
  * recipient is the pupil's primary contact (or first guardian if none flagged)
"""

from django.utils import timezone

from students.models import Level, Student, StudentStatus

from .models import SmsTemplateKey
from .sms_service import (
    Recipient,
    _fmt_date,
    _fmt_money,
    _school_contact,
    _school_name,
    class_label,
    primary_guardian,
)

_ACTIVE = StudentStatus.ACTIVE


def _students_in_scope(audience: str, level: str = "", stream: str = ""):
    qs = Student.objects.filter(status=_ACTIVE).prefetch_related("guardians")
    if audience == "CLASS":
        qs = qs.filter(level=level)
        if stream:
            qs = qs.filter(stream__iexact=stream)
    elif audience == "LEVEL":
        qs = qs.filter(level=level)
    return qs.order_by("level", "stream", "last_name", "first_name")


# ── exam results ───────────────────────────────────────────────────────────

def exam_results_recipients(exam) -> list[Recipient]:
    from decimal import Decimal

    from exams.models import MarkEntry
    from exams.utils import get_grade

    students = list(
        Student.objects.filter(status=_ACTIVE, level=exam.level)
        .filter(**({"stream__iexact": exam.stream} if exam.stream else {}))
        .prefetch_related("guardians")
        .order_by("last_name", "first_name")
    )
    entries = MarkEntry.objects.filter(exam=exam, student__in=students)

    marks_by_student: dict[int, list] = {}
    for entry in entries:
        marks_by_student.setdefault(entry.student_id, []).append(entry)

    totals = {sid: sum(m.score for m in marks) for sid, marks in marks_by_student.items()}
    ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
    position: dict[int, int] = {}
    prev = None
    place = 0
    for i, (sid, total) in enumerate(ranked, start=1):
        if total != prev:
            place = i
            prev = total
        position[sid] = place
    class_size = len(ranked)

    school = _school_name()
    label = class_label(exam.level, exam.stream)
    recipients: list[Recipient] = []
    for student in students:
        guardian = primary_guardian(student)
        marks = marks_by_student.get(student.pk)
        if not marks:
            recipients.append(Recipient(student=student, guardian=guardian, context={},
                                        force_skip="no marks entered for this exam"))
            continue
        total = totals[student.pk]
        out_of = len(marks) * 100
        average = (total / len(marks)) if marks else Decimal("0")
        recipients.append(Recipient(
            student=student, guardian=guardian,
            force_skip="" if guardian else "no guardian on file",
            context={
                "school_name": school,
                "pupil_name": student.full_name,
                "class": label,
                "exam_name": exam.name,
                "total": f"{total:.0f}",
                "out_of": str(out_of),
                "average": f"{average:.1f}",
                "grade": get_grade(average),
                "position": str(position[student.pk]),
                "class_size": str(class_size),
            },
        ))
    return recipients


# ── fee reminders ──────────────────────────────────────────────────────────

def fee_reminder_recipients(*, scope: str = "all", level: str = "", stream: str = "",
                            as_of=None) -> list[Recipient]:
    from fees.models import Invoice, InvoiceStatus, Term

    as_of = as_of or timezone.localdate()
    term_label = dict(Term.choices)

    inv_qs = (
        Invoice.objects
        .filter(status__in=[InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE])
        .select_related("student")
        .prefetch_related("student__guardians")
        .order_by("student_id", "due_date")
    )
    if level:
        inv_qs = inv_qs.filter(student__level=level)
    if stream:
        inv_qs = inv_qs.filter(student__stream__iexact=stream)

    per_student: dict[int, list] = {}
    for inv in inv_qs:
        if inv.balance <= 0:
            continue
        per_student.setdefault(inv.student_id, []).append(inv)

    school = _school_name()
    contact = _school_contact()
    recipients: list[Recipient] = []
    for invoices in per_student.values():
        oldest = invoices[0]  # earliest due_date
        student = oldest.student
        total_balance = sum(i.balance for i in invoices)
        is_overdue = oldest.due_date < as_of
        if scope == "overdue" and not is_overdue:
            continue
        guardian = primary_guardian(student)
        recipients.append(Recipient(
            student=student, guardian=guardian,
            template_key=(SmsTemplateKey.FEE_REMINDER_OVERDUE if is_overdue
                          else SmsTemplateKey.FEE_REMINDER_DUE),
            force_skip="" if guardian else "no guardian on file",
            context={
                "school_name": school,
                "school_contact": contact,
                "student_name": student.full_name,
                "pupil_name": student.full_name,
                "class": class_label(student.level, student.stream),
                "balance": _fmt_money(total_balance),
                "due_date": _fmt_date(oldest.due_date),
                "term": term_label.get(oldest.term, oldest.term),
            },
        ))
    return recipients


# ── announcement ──────────────────────────────────────────────────────────

def announcement_recipients(*, audience: str, message: str, level: str = "",
                            stream: str = "") -> list[Recipient]:
    school = _school_name()
    recipients: list[Recipient] = []
    for student in _students_in_scope(audience, level, stream):
        guardian = primary_guardian(student)
        recipients.append(Recipient(
            student=student, guardian=guardian,
            force_skip="" if guardian else "no guardian on file",
            context={"school_name": school, "pupil_name": student.full_name, "message": message},
        ))
    return recipients


# ── term dates ────────────────────────────────────────────────────────────

def term_dates_recipients(*, boundary: str, term_label: str, closing_date=None,
                          opening_date=None) -> list[Recipient]:
    school = _school_name()
    recipients: list[Recipient] = []
    for student in Student.objects.filter(status=_ACTIVE).prefetch_related("guardians"):
        guardian = primary_guardian(student)
        ctx = {
            "school_name": school,
            "pupil_name": student.full_name,
            "term": term_label,
            "closing_date": _fmt_date(closing_date),
            "opening_date": _fmt_date(opening_date),
        }
        recipients.append(Recipient(
            student=student, guardian=guardian,
            force_skip="" if guardian else "no guardian on file",
            context=ctx,
        ))
    return recipients


# ── payment thank-you ─────────────────────────────────────────────────────

def payment_thank_you_recipients(payment) -> list[Recipient]:
    from fees.models import Invoice, InvoiceStatus

    student = payment.invoice.student
    guardian = primary_guardian(
        Student.objects.prefetch_related("guardians").get(pk=student.pk)
    )
    outstanding = sum(
        i.balance for i in Invoice.objects.filter(
            student=student,
            status__in=[InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE],
        )
        if i.balance > 0
    )
    ctx = {
        "school_name": _school_name(),
        "pupil_name": student.full_name,
        "amount": _fmt_money(payment.amount),
        "payment_date": _fmt_date(payment.paid_at),
        "receipt_number": payment.receipt_number or "",
        "outstanding_balance": _fmt_money(outstanding),
    }
    return [Recipient(
        student=student, guardian=guardian,
        force_skip="" if guardian else "no guardian on file",
        context=ctx,
    )]
