from django.conf import settings
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver

from students.models import Level


class Designation(models.TextChoices):
    TEACHER = 'TEACHER', 'Teacher'
    HOD = 'HOD', 'Head of Department'
    DEPUTY_HEAD = 'DEPUTY_HEAD', 'Deputy Headteacher'
    HEADTEACHER = 'HEADTEACHER', 'Headteacher'
    BURSAR = 'BURSAR', 'Bursar'
    ADMIN = 'ADMIN', 'Administration'


class ContractType(models.TextChoices):
    PERMANENT = 'PERMANENT', 'Permanent'
    CONTRACT = 'CONTRACT', 'Contract'
    PART_TIME = 'PART_TIME', 'Part-Time'


class LeaveType(models.TextChoices):
    ANNUAL = 'ANNUAL', 'Annual Leave'
    SICK = 'SICK', 'Sick Leave'
    MATERNITY = 'MATERNITY', 'Maternity Leave'
    PATERNITY = 'PATERNITY', 'Paternity Leave'
    UNPAID = 'UNPAID', 'Unpaid Leave'


class LeaveStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    APPROVED = 'APPROVED', 'Approved'
    REJECTED = 'REJECTED', 'Rejected'


class StaffProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='staff_profile',
    )
    employee_id = models.CharField(max_length=20, unique=True, blank=True, db_index=True)
    tsc_number = models.CharField(max_length=50, blank=True, verbose_name='TSC Number')
    designation = models.CharField(max_length=15, choices=Designation.choices)
    subjects = models.ManyToManyField(
        'exams.Subject', blank=True, related_name='teaching_staff'
    )
    class_teacher_of_level = models.CharField(
        max_length=10, choices=Level.choices, blank=True
    )
    class_teacher_of_stream = models.CharField(max_length=10, blank=True)
    hire_date = models.DateField()
    contract_type = models.CharField(max_length=10, choices=ContractType.choices)
    basic_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    national_id = models.CharField(max_length=50, blank=True)
    # [{degree, institution, year_completed}]
    qualifications = models.JSONField(default=list, blank=True)
    emergency_contact_name = models.CharField(max_length=255, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ['user__full_name']

    def __str__(self):
        return f'{self.employee_id} — {self.user.full_name}'


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
    leave_type = models.CharField(max_length=10, choices=LeaveType.choices)
    start_date = models.DateField()
    end_date = models.DateField()
    days_requested = models.IntegerField()
    reason = models.TextField()
    status = models.CharField(
        max_length=10, choices=LeaveStatus.choices, default=LeaveStatus.PENDING
    )
    applied_at = models.DateTimeField(auto_now_add=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='leave_reviews',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-applied_at']

    def __str__(self):
        return (
            f'{self.staff.employee_id} | {self.leave_type} | '
            f'{self.start_date} → {self.end_date} | {self.status}'
        )
