from django.conf import settings
from django.db import models

from fees.models import Quarter


class Session(models.TextChoices):
    MORNING = 'MORNING', 'Morning'
    AFTERNOON = 'AFTERNOON', 'Afternoon'


class AttendanceStatus(models.TextChoices):
    PRESENT = 'PRESENT', 'Present'
    ABSENT = 'ABSENT', 'Absent'
    LATE = 'LATE', 'Late'
    EXCUSED = 'EXCUSED', 'Excused'


class AttendanceRecord(models.Model):
    student = models.ForeignKey(
        'students.Student',
        on_delete=models.CASCADE,
        related_name='attendance_records',
    )
    date = models.DateField(db_index=True)
    session = models.CharField(max_length=10, choices=Session.choices)
    status = models.CharField(max_length=10, choices=AttendanceStatus.choices)
    quarter = models.CharField(
        max_length=5, choices=Quarter.choices, null=True, blank=True, db_index=True
    )
    reason = models.TextField(blank=True)
    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='attendance_marked',
    )
    marked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('student', 'date', 'session')
        ordering = ['-date', 'session', 'student__last_name']

    def __str__(self):
        return (
            f'{self.student.student_id} | {self.date} | '
            f'{self.session} | {self.status}'
        )


class AbsenceAlert(models.Model):
    student = models.ForeignKey(
        'students.Student',
        on_delete=models.CASCADE,
        related_name='absence_alerts',
    )
    date = models.DateField()
    sms_sent = models.BooleanField(default=False)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('student', 'date')
        ordering = ['-date']

    def __str__(self):
        return f'Alert: {self.student.student_id} | {self.date} | SMS sent: {self.sms_sent}'
