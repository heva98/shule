from django.contrib import admin
from django.utils.html import format_html

from .models import Exam, MarkEntry, Subject


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'level_group', 'is_compulsory')
    list_filter = ('level_group', 'is_compulsory')
    search_fields = ('name', 'code')
    ordering = ('level_group', 'name')


class MarkEntryInline(admin.TabularInline):
    model = MarkEntry
    extra = 0
    fields = ('student', 'subject', 'score', 'grade', 'remarks')
    readonly_fields = ('grade',)
    raw_id_fields = ('student',)


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'academic_year', 'term', 'level', 'stream',
        'exam_type', 'start_date', 'end_date',
    )
    list_filter = ('exam_type', 'term', 'level', 'academic_year')
    search_fields = ('name',)
    date_hierarchy = 'start_date'
    readonly_fields = ('created_by',)
    ordering = ('-academic_year__year', 'term', 'level')
    inlines = [MarkEntryInline]

    def save_model(self, request, obj, form, change):
        if not obj.pk:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


_GRADE_COLOURS = {
    'A': '#27ae60',
    'B': '#2980b9',
    'C': '#f39c12',
    'D': '#e67e22',
    'F': '#e74c3c',
}


@admin.register(MarkEntry)
class MarkEntryAdmin(admin.ModelAdmin):
    list_display = (
        'student_col', 'exam', 'subject',
        'score', 'grade_badge', 'entered_by',
    )
    list_filter = ('grade', 'exam__term', 'exam__level', 'subject')
    search_fields = (
        'student__student_id',
        'student__first_name',
        'student__last_name',
        'exam__name',
    )
    readonly_fields = ('grade',)
    raw_id_fields = ('student',)
    ordering = ('exam', 'student__last_name', 'subject__name')

    def student_col(self, obj):
        return f'{obj.student.student_id} — {obj.student.full_name}'
    student_col.short_description = 'Student'
    student_col.admin_order_field = 'student__last_name'

    def grade_badge(self, obj):
        colour = _GRADE_COLOURS.get(obj.grade, '#7f8c8d')
        return format_html(
            '<span style="background:{};color:#fff;padding:2px 10px;'
            'border-radius:4px;font-weight:bold">{}</span>',
            colour,
            obj.grade,
        )
    grade_badge.short_description = 'Grade'
    grade_badge.admin_order_field = 'grade'
