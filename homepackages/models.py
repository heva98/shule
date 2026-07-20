from django.conf import settings
from django.db import models

from fees.models import Quarter
from students.models import Level


class HomePackage(models.Model):
    """Holiday work handed out at the end of a quarter, due back when the next one starts."""
    title = models.CharField(max_length=255)
    instructions = models.TextField(blank=True)
    subject = models.ForeignKey(
        'exams.Subject', on_delete=models.PROTECT, related_name='home_packages'
    )
    level = models.CharField(max_length=10, choices=Level.choices)
    stream = models.CharField(max_length=10, blank=True)
    academic_year = models.ForeignKey(
        'fees.AcademicYear', on_delete=models.PROTECT, related_name='home_packages'
    )
    quarter = models.CharField(
        max_length=5, choices=Quarter.choices,
        help_text='Which quarter this holiday package follows.',
    )
    due_date = models.DateField(
        help_text='When students are expected back with completed work — usually the first day of the next quarter.'
    )
    attachment = models.FileField(upload_to='home_packages/', blank=True, null=True)
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='home_packages_posted'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-academic_year', '-quarter', '-created_at']

    def __str__(self):
        cls = f'{self.level}{self.stream}' if self.stream else self.level
        return f'{self.title} — {cls} — {self.quarter}'
