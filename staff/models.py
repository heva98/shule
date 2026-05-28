from django.conf import settings
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver

from students.models import Level


class Designation(models.TextChoices):
    TEACHER      = 'TEACHER',      'Teacher'
    HOD          = 'HOD',          'Head of Department'
    DEPUTY_HEAD  = 'DEPUTY_HEAD',  'Deputy Headteacher'
    HEADTEACHER  = 'HEADTEACHER',  'Headteacher'
    BURSAR       = 'BURSAR',       'Bursar'
    ADMIN        = 'ADMIN',        'Administration'


class ContractType(models.TextChoices):
    PERMANENT = 'PERMANENT', 'Permanent'
    CONTRACT  = 'CONTRACT',  'Contract'
    PART_TIME = 'PART_TIME', 'Part-Time'


class LeaveType(models.TextChoices):
    ANNUAL    = 'ANNUAL',    'Annual Leave'
    SICK      = 'SICK',      'Sick Leave'
    MATERNITY = 'MATERNITY', 'Maternity Leave'
    PATERNITY = 'PATERNITY', 'Paternity Leave'
    UNPAID    = 'UNPAID',    'Unpaid Leave'


class LeaveStatus(models.TextChoices):
    PENDING  = 'PENDING',  'Pending'
    APPROVED = 'APPROVED', 'Approved'
    REJECTED = 'REJECTED', 'Rejected'


class StaffProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='staff_profile',
    )
    employee_id  = models.CharField(max_length=20, unique=True, blank=True, db_index=True)
    tsc_number   = models.CharField(max_length=50, blank=True, verbose_name='TSC Number')
    designation  = models.CharField(max_length=15, choices=Designation.choices)
    subjects     = models.ManyToManyField(
        'exams.Subject', blank=True, related_name='teaching_staff'
    )
    # Legacy simple class-teacher reference (kept; replaced by ClassTeacherAssignment)
    class_teacher_of_level  = models.CharField(max_length=10, choices=Level.choices, blank=True)
    class_teacher_of_stream = models.CharField(max_length=10, blank=True)

    # Level groups this staff member is associated with — [] means all levels
    taught_levels  = models.JSONField(
        default=list, blank=True,
        help_text='Level groups: PRIMARY, OLEVEL, ALEVEL. Empty = all levels.',
    )
    hire_date      = models.DateField()
    contract_type  = models.CharField(max_length=10, choices=ContractType.choices)
    basic_salary   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    national_id    = models.CharField(max_length=50, blank=True)
    # [{degree, institution, year_completed}]
    qualifications = models.JSONField(default=list, blank=True)
    emergency_contact_name  = models.CharField(max_length=255, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ['user__full_name']

    def __str__(self):
        return f'{self.employee_id} — {self.user.full_name}'

    @property
    def current_class_assignment(self):
        """Return the active ClassTeacherAssignment for the current academic year, or None."""
        return self.class_assignments.filter(
            is_active=True,
            academic_year__is_current=True,
        ).first()


@receiver(post_save, sender=StaffProfile)
def generate_employee_id(sender, instance, created, **kwargs):
    if created and not instance.employee_id:
        seq = str(instance.pk).zfill(3)
        employee_id = f'EMP-{seq}'
        StaffProfile.objects.filter(pk=instance.pk).update(employee_id=employee_id)
        instance.employee_id = employee_id


class LeaveRequest(models.Model):
    staff = models.ForeignKey(
        StaffProfile, on_delete=models.CASCADE, related_name='leave_requests'
    )
    leave_type    = models.CharField(max_length=10, choices=LeaveType.choices)
    start_date    = models.DateField()
    end_date      = models.DateField()
    days_requested = models.IntegerField()
    reason        = models.TextField()
    status        = models.CharField(
        max_length=10, choices=LeaveStatus.choices, default=LeaveStatus.PENDING
    )
    applied_at    = models.DateTimeField(auto_now_add=True)
    reviewed_by   = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='leave_reviews',
    )
    reviewed_at   = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-applied_at']

    def __str__(self):
        return (
            f'{self.staff.employee_id} | {self.leave_type} | '
            f'{self.start_date} → {self.end_date} | {self.status}'
        )


class ClassTeacherAssignment(models.Model):
    """One class teacher per class (level + stream) per academic year."""
    teacher      = models.ForeignKey(
        StaffProfile, on_delete=models.CASCADE, related_name='class_assignments'
    )
    level        = models.CharField(max_length=10, choices=Level.choices)
    stream       = models.CharField(max_length=10)
    academic_year = models.ForeignKey(
        'fees.AcademicYear', on_delete=models.PROTECT, related_name='class_assignments'
    )
    assigned_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='class_assignments_made',
    )
    assigned_at  = models.DateTimeField(auto_now_add=True)
    is_active    = models.BooleanField(default=True)

    class Meta:
        unique_together = ('level', 'stream', 'academic_year')
        ordering = ['academic_year', 'level', 'stream']

    def __str__(self):
        stream = self.stream.upper()
        return (
            f'{self.level}{stream} — '
            f'{self.teacher.user.full_name} ({self.academic_year})'
        )


class DisciplinaryIncident(models.Model):
    class Severity(models.TextChoices):
        MINOR    = 'MINOR',    'Minor'
        MODERATE = 'MODERATE', 'Moderate'
        MAJOR    = 'MAJOR',    'Major'

    class IncidentStatus(models.TextChoices):
        OPEN     = 'OPEN',     'Open'
        REFERRED = 'REFERRED', 'Referred to Headteacher'
        RESOLVED = 'RESOLVED', 'Resolved'

    student     = models.ForeignKey(
        'students.Student', on_delete=models.CASCADE, related_name='disciplinary_incidents'
    )
    reported_by = models.ForeignKey(
        StaffProfile, on_delete=models.PROTECT, related_name='reported_incidents'
    )
    date          = models.DateField()
    incident_type = models.CharField(max_length=100)
    description   = models.TextField()
    severity      = models.CharField(max_length=10, choices=Severity.choices)
    status        = models.CharField(
        max_length=10, choices=IncidentStatus.choices, default=IncidentStatus.OPEN
    )
    action_taken  = models.TextField(blank=True)
    referred_to   = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='referred_incidents',
    )
    referred_at   = models.DateTimeField(null=True, blank=True)
    resolved_at   = models.DateTimeField(null=True, blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return (
            f'Incident: {self.student.student_id} | '
            f'{self.incident_type} | {self.date} | {self.status}'
        )
