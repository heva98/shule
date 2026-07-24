import uuid

from django.conf import settings
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone


class Level(models.TextChoices):
    STD1 = 'STD1', 'Standard 1'
    STD2 = 'STD2', 'Standard 2'
    STD3 = 'STD3', 'Standard 3'
    STD4 = 'STD4', 'Standard 4'
    STD5 = 'STD5', 'Standard 5'
    STD6 = 'STD6', 'Standard 6'
    STD7 = 'STD7', 'Standard 7'
    FORM1 = 'FORM1', 'Form 1'
    FORM2 = 'FORM2', 'Form 2'
    FORM3 = 'FORM3', 'Form 3'
    FORM4 = 'FORM4', 'Form 4'
    FORM5 = 'FORM5', 'Form 5'
    FORM6 = 'FORM6', 'Form 6'


class StudentStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Active'
    TRANSFERRED = 'TRANSFERRED', 'Transferred'
    GRADUATED = 'GRADUATED', 'Graduated'
    SUSPENDED = 'SUSPENDED', 'Suspended'
    EXPELLED = 'EXPELLED', 'Expelled'


class Student(models.Model):
    # Opaque, non-guessable identifier used in URLs/API lookups — never the
    # sequential pk or the human-readable student_id (admission number), so a
    # link can't be used to enumerate students or double as a credential.
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    student_id = models.CharField(max_length=20, unique=True, blank=True, db_index=True)
    nemis_id = models.CharField(max_length=50, blank=True, unique=True, null=True)

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)

    date_of_birth = models.DateField()
    gender = models.CharField(max_length=1, choices=[('M', 'Male'), ('F', 'Female')])

    photo = models.ImageField(upload_to='students/', blank=True, null=True)

    level = models.CharField(max_length=10, choices=Level.choices)
    stream = models.CharField(max_length=10, blank=True)

    admission_date = models.DateField(default=timezone.localdate)
    status = models.CharField(
        max_length=15, choices=StudentStatus.choices, default=StudentStatus.ACTIVE
    )

    has_special_needs = models.BooleanField(default=False)
    special_needs_notes = models.TextField(blank=True)

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='student_profile',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f'{self.student_id} — {self.full_name}'

    @property
    def full_name(self):
        parts = [self.first_name, self.middle_name, self.last_name]
        return ' '.join(p for p in parts if p)


class Relationship(models.TextChoices):
    FATHER = 'FATHER', 'Father'
    MOTHER = 'MOTHER', 'Mother'
    GUARDIAN = 'GUARDIAN', 'Guardian'
    OTHER = 'OTHER', 'Other'


class Guardian(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='guardians')

    full_name = models.CharField(max_length=255)
    relationship = models.CharField(max_length=10, choices=Relationship.choices)

    phone = models.CharField(max_length=20)
    whatsapp_phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    national_id = models.CharField(max_length=50, blank=True)

    is_primary_contact = models.BooleanField(default=False)

    class Meta:
        ordering = ['-is_primary_contact', 'full_name']

    def __str__(self):
        return f'{self.full_name} ({self.relationship}) — {self.student.student_id}'


@receiver(post_save, sender=Student)
def generate_student_id(sender, instance, created, **kwargs):
    if created and not instance.student_id:
        year = instance.admission_date.year if instance.admission_date else instance.created_at.year
        # Zero-padded sequence using the primary key
        seq = str(instance.pk).zfill(4)
        student_id = f'SHULE-{year}-{seq}'
        # Use update to avoid re-triggering the signal
        Student.objects.filter(pk=instance.pk).update(student_id=student_id)
        instance.student_id = student_id
