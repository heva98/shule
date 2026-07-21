from django.conf import settings
from django.db import models


class Dormitory(models.Model):
    """A boarding house. Single-gender by design — Tanzanian schools house boys
    and girls in separate dormitories, never mixed."""
    class Gender(models.TextChoices):
        MALE = 'M', 'Boys'
        FEMALE = 'F', 'Girls'

    name = models.CharField(max_length=100, unique=True)
    gender = models.CharField(max_length=1, choices=Gender.choices)
    capacity = models.PositiveIntegerField()
    warden = models.ForeignKey(
        'staff.StaffProfile', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='dormitories_managed',
    )
    location = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Dormitories'

    def __str__(self):
        return f'{self.name} ({self.get_gender_display()})'

    @property
    def occupied_count(self):
        return self.assignments.filter(is_active=True).count()

    @property
    def available_beds(self):
        return self.capacity - self.occupied_count


class BoardingAssignment(models.Model):
    """A student's placement in a dormitory for a given academic year."""
    student = models.ForeignKey(
        'students.Student', on_delete=models.CASCADE, related_name='boarding_assignments'
    )
    dormitory = models.ForeignKey(Dormitory, on_delete=models.PROTECT, related_name='assignments')
    academic_year = models.ForeignKey(
        'fees.AcademicYear', on_delete=models.PROTECT, related_name='boarding_assignments'
    )
    bed_number = models.CharField(max_length=20, blank=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='boarding_assignments_made'
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    vacated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-is_active', 'dormitory__name', 'bed_number']
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'academic_year'],
                condition=models.Q(is_active=True),
                name='unique_active_boarding_assignment_per_year',
            )
        ]

    def __str__(self):
        return f'{self.student.full_name} — {self.dormitory.name} ({self.academic_year})'
