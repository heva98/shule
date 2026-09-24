from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from fees.models import AcademicYear, Term, Quarter
from students.fields import StreamField
from students.models import Level
from shule.utils import validate_term_quarter

from .utils import get_grade


class LevelGroup(models.TextChoices):
    NURSERY = 'NURSERY', 'Nursery (Baby-Senior)'
    PRIMARY = 'PRIMARY', 'Primary (Std 1-7)'
    OLEVEL = 'OLEVEL', 'O-Level (Form 1-4)'
    ALEVEL = 'ALEVEL', 'A-Level (Form 5-6)'


class ExamType(models.TextChoices):
    CA1 = 'CA1', 'Continuous Assessment 1'
    CA2 = 'CA2', 'Continuous Assessment 2'
    WEEKLY = 'WEEKLY', 'Weekly Test'
    MIDTERM = 'MIDTERM', 'Mid-Term'
    TERMINAL = 'TERMINAL', 'Terminal'
    MOCK = 'MOCK', 'Mock'


class Subject(models.Model):
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=10, unique=True)
    level_group = models.CharField(max_length=10, choices=LevelGroup.choices)
    is_compulsory = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['level_group', 'name']

    def __str__(self):
        return f'{self.code} — {self.name}'


class Exam(models.Model):
    name = models.CharField(max_length=200)
    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.PROTECT, related_name='exams'
    )
    term = models.CharField(max_length=10, choices=Term.choices)
    quarter = models.CharField(max_length=5, choices=Quarter.choices)
    level = models.CharField(max_length=10, choices=Level.choices)
    stream = StreamField(blank=True)
    exam_type = models.CharField(max_length=10, choices=ExamType.choices)
    start_date = models.DateField()
    end_date = models.DateField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='exams_created',
    )

    class Meta:
        ordering = ['-academic_year__year', 'term', 'quarter', 'level']

    def __str__(self):
        stream_part = f' {self.stream}' if self.stream else ''
        return f'{self.name} | {self.level}{stream_part} | {self.academic_year}'

    def clean(self):
        validate_term_quarter(self.term, self.quarter)


class MarkEntry(models.Model):
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='mark_entries')
    student = models.ForeignKey(
        'students.Student', on_delete=models.CASCADE, related_name='mark_entries'
    )
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name='mark_entries')
    score = models.DecimalField(max_digits=5, decimal_places=2)
    grade = models.CharField(max_length=2, blank=True)
    remarks = models.CharField(max_length=255, blank=True)
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='marks_entered',
    )

    class Meta:
        unique_together = ('exam', 'student', 'subject')
        ordering = ['student__last_name', 'subject__name']

    def __str__(self):
        return (
            f'{self.student.student_id} | {self.subject.code} | '
            f'{self.score} ({self.grade})'
        )

    def save(self, *args, **kwargs):
        self.grade = get_grade(self.score)
        super().save(*args, **kwargs)


# ── Skills / conduct assessment (report card) ──────────────────────────────────

class SkillName(models.TextChoices):
    CREATIVITY = 'CREATIVITY', 'Creativity'
    DISCIPLINE = 'DISCIPLINE', 'Discipline'
    SPORT = 'SPORT', 'Sport'
    SMARTNESS = 'SMARTNESS', 'Smartness'
    SPEAKING_SKILLS = 'SPEAKING_SKILLS', 'Speaking Skills'
    WRITING_SKILLS = 'WRITING_SKILLS', 'Writing Skills'


class StudentSkillAssessment(models.Model):
    """A non-academic skill/conduct grade for one student, one exam — the
    'skills and conduct' section of the report card. Separate from MarkEntry
    since these have no subject and are usually ungraded on marks (grade only)."""
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='skill_assessments')
    student = models.ForeignKey(
        'students.Student', on_delete=models.CASCADE, related_name='skill_assessments'
    )
    skill = models.CharField(max_length=20, choices=SkillName.choices)
    marks = models.PositiveSmallIntegerField(null=True, blank=True)
    grade = models.CharField(max_length=2)
    remarks = models.CharField(max_length=255, blank=True)
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='skill_assessments_entered',
    )

    class Meta:
        unique_together = ('exam', 'student', 'skill')
        ordering = ['student__last_name', 'skill']

    def __str__(self):
        return f'{self.student.student_id} | {self.get_skill_display()} | {self.grade}'


# ── Report card remarks ─────────────────────────────────────────────────────────

class ReportCardRemark(models.Model):
    """Free-text remarks + sign-off for one student's report card for one
    exam — class teacher, academic teacher, and head teacher sections."""
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='report_remarks')
    student = models.ForeignKey(
        'students.Student', on_delete=models.CASCADE, related_name='report_remarks'
    )

    class_teacher_text = models.TextField(blank=True)
    class_teacher_name = models.CharField(max_length=255, blank=True)
    class_teacher_date = models.DateField(null=True, blank=True)
    class_teacher_signature = models.ImageField(upload_to='report_signatures/', blank=True, null=True)

    academic_text = models.TextField(blank=True)
    academic_name = models.CharField(max_length=255, blank=True)
    academic_date = models.DateField(null=True, blank=True)
    academic_signature = models.ImageField(upload_to='report_signatures/', blank=True, null=True)

    head_teacher_text = models.TextField(blank=True)
    head_teacher_date = models.DateField(null=True, blank=True)
    head_teacher_signature = models.ImageField(upload_to='report_signatures/', blank=True, null=True)

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='report_remarks_updated',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('exam', 'student')

    def __str__(self):
        return f'Remarks | {self.student.student_id} | {self.exam}'
