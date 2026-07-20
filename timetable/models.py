from django.db import models

from students.models import Level


class DayOfWeek(models.TextChoices):
    MONDAY = 'MON', 'Monday'
    TUESDAY = 'TUE', 'Tuesday'
    WEDNESDAY = 'WED', 'Wednesday'
    THURSDAY = 'THU', 'Thursday'
    FRIDAY = 'FRI', 'Friday'
    SATURDAY = 'SAT', 'Saturday'


class Period(models.Model):
    """A daily time slot shared across the whole school, e.g. 'Period 1', 08:00-08:40."""
    name = models.CharField(max_length=50)
    start_time = models.TimeField()
    end_time = models.TimeField()
    order = models.PositiveSmallIntegerField(help_text='Display order through the day')
    is_break = models.BooleanField(default=False, help_text='Break / lunch slot — no lesson assigned')

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f'{self.name} ({self.start_time:%H:%M}-{self.end_time:%H:%M})'


class TimetableEntry(models.Model):
    """One scheduled lesson: a class (level+stream) has a subject with a teacher, on a given day and period."""
    academic_year = models.ForeignKey(
        'fees.AcademicYear', on_delete=models.PROTECT, related_name='timetable_entries'
    )
    level = models.CharField(max_length=10, choices=Level.choices)
    stream = models.CharField(max_length=10, blank=True)
    day_of_week = models.CharField(max_length=3, choices=DayOfWeek.choices)
    period = models.ForeignKey(Period, on_delete=models.PROTECT, related_name='entries')
    subject = models.ForeignKey(
        'exams.Subject', on_delete=models.SET_NULL, null=True, blank=True, related_name='timetable_entries'
    )
    teacher = models.ForeignKey(
        'staff.StaffProfile', on_delete=models.SET_NULL, null=True, blank=True, related_name='timetable_entries'
    )
    room = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['day_of_week', 'period__order']
        unique_together = ('academic_year', 'level', 'stream', 'day_of_week', 'period')
        verbose_name_plural = 'Timetable entries'

    def __str__(self):
        cls = f'{self.level}{self.stream}' if self.stream else self.level
        return f'{cls} — {self.get_day_of_week_display()} {self.period.name} — {self.subject or "Free"}'
