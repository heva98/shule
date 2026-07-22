from django.contrib import admin

from .models import StudentDocument


@admin.register(StudentDocument)
class StudentDocumentAdmin(admin.ModelAdmin):
    list_display = ('student', 'category', 'title', 'uploaded_by', 'uploaded_at')
    list_filter = ('category', 'uploaded_at')
    search_fields = ('student__first_name', 'student__last_name', 'student__student_id', 'title')
    ordering = ('-uploaded_at',)
