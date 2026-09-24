"""
Enrolment history: keeps `Enrolment` rows in step with `Student` so the
class and status a student held in each academic year survive promotions,
transfers and graduation.

Two entry points, both wired up in `students.signals`:

- `record_enrolment(student)` runs on every Student save and mirrors the
  student's level/stream/status onto the *current* year's row.
- `open_year(year)` runs when a year becomes current and seeds a row for
  every enrolled student, carrying over their class as it stands. Promote
  students *after* switching the year: the promotion then updates the new
  year's row, and last year's row keeps the old class.

A year whose `q4_end` has passed is treated as closed, so promoting students
in the gap between the end of Q4 and switching the year doesn't overwrite
the year-end record. `open_year` still picks up those changes for the new
year when it is switched on.
"""
from django.utils import timezone

from .models import Enrolment, Student, StudentStatus

# Statuses that count as "on the roll" for the year. A suspended student is
# still enrolled; everyone else has left.
ENROLLED_STATUSES = (StudentStatus.ACTIVE, StudentStatus.SUSPENDED)


def _current_year():
    from fees.models import AcademicYear
    return AcademicYear.objects.filter(is_current=True).first()


def is_year_closed(year, today=None):
    today = today or timezone.localdate()
    return year.q4_end is not None and today > year.q4_end


def record_enrolment(student, year=None, today=None):
    """
    Mirror `student`'s current level/stream/status onto their enrolment row
    for `year` (default: the current academic year). Returns the row, or
    None when nothing was recorded (no current year, the year is closed, or
    the student has left and never had a row for this year).
    """
    year = year or _current_year()
    if year is None:
        return None
    today = today or timezone.localdate()
    if is_year_closed(year, today):
        return None

    enrolled = student.status in ENROLLED_STATUSES
    enrolment = Enrolment.objects.filter(student=student, academic_year=year).first()

    if enrolment is None:
        if not enrolled:
            return None
        return Enrolment.objects.create(
            student=student,
            academic_year=year,
            level=student.level,
            stream=student.stream,
            status=student.status,
            enrolled_on=today,
        )

    if enrolled:
        left_on = None
    else:
        left_on = enrolment.left_on or today

    changed = (
        enrolment.level != student.level
        or enrolment.stream != student.stream
        or enrolment.status != student.status
        or enrolment.left_on != left_on
    )
    if changed:
        enrolment.level = student.level
        enrolment.stream = student.stream
        enrolment.status = student.status
        enrolment.left_on = left_on
        enrolment.save(update_fields=['level', 'stream', 'status', 'left_on', 'updated_at'])
    return enrolment


def open_year(year, today=None):
    """
    Seed an enrolment row in `year` for every enrolled student who doesn't
    have one yet. Existing rows are left alone, so it is safe to run
    repeatedly. Returns the number of rows created.
    """
    today = today or timezone.localdate()
    enrolled_on = year.q1_start or today
    already = Enrolment.objects.filter(academic_year=year).values_list('student_id', flat=True)
    students = (
        Student.objects.filter(status__in=ENROLLED_STATUSES)
        .exclude(pk__in=already)
        .only('pk', 'level', 'stream', 'status')
    )
    rows = [
        Enrolment(
            student=s,
            academic_year=year,
            level=s.level,
            stream=s.stream,
            status=s.status,
            enrolled_on=enrolled_on,
        )
        for s in students
    ]
    Enrolment.objects.bulk_create(rows, ignore_conflicts=True, batch_size=500)
    return len(rows)
