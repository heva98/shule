from django.conf import settings
from django.db import models


class DocumentCategory(models.TextChoices):
    BIRTH_CERTIFICATE = 'BIRTH_CERTIFICATE', 'Birth Certificate'
    TRANSFER_LETTER = 'TRANSFER_LETTER', 'Transfer Letter'
    MEDICAL_FORM = 'MEDICAL_FORM', 'Medical Form'
    IMMUNIZATION_RECORD = 'IMMUNIZATION_RECORD', 'Immunization Record'
    NATIONAL_ID = 'NATIONAL_ID', 'National ID / Passport'
    OTHER = 'OTHER', 'Other'


class StudentDocument(models.Model):
    """A scanned document attached to a student's file — birth certificate, transfer
    letter, medical form, etc. Access is restricted to senior staff (see permissions.py."""
    student = models.ForeignKey(
        'students.Student', on_delete=models.CASCADE, related_name='documents'
    )
    category = models.CharField(max_length=30, choices=DocumentCategory.choices)
    title = models.CharField(max_length=255, blank=True)
    file = models.FileField(upload_to='student_documents/%Y/%m/')
    notes = models.TextField(blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='student_documents_uploaded'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f'{self.student.full_name} — {self.get_category_display()}'
