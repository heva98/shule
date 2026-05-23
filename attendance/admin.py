from django.contrib import admin
from django.utils.html import format_html

from .models import AbsenceAlert, AttendanceRecord, AttendanceStatus


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ('student_col', 'date', 'session', 'status_badge', 'marked_by', 'marked_at')
    list_filter = ('status', 'session', 'student__level', 'date')
    search_fields = (
        'student__first_name', 'student__last_name',
        'student__student_id',
    )
    date_hierarchy = 'date'
    readonly_fields = ('marked_at',)
    ordering = ('-date', 'session', 'student__last_name')

    fieldsets = (
        ('Student', {'fields': ('student',)}),
        ('Session', {'fields': ('date', 'session')}),
        ('Attendance', {'fields': ('status', 'reason')}),
        ('Meta', {'fields': ('marked_by', 'marked_at'), 'classes': ('collapse',)}),
    )

    STATUS_COLOURS = {
        AttendanceStatus.PRESENT: '#27ae60',
        AttendanceStatus.ABSENT: '#e74c3c',
        AttendanceStatus.LATE: '#f39c12',
        AttendanceStatus.EXCUSED: '#3498db',
    }

    def student_col(self, obj):
        return f'{obj.student.student_id} — {obj.student.full_name}'
    student_col.short_description = 'Student'
    student_col.admin_order_field = 'student__last_name'

    def status_badge(self, obj):
        colour = self.STATUS_COLOURS.get(obj.status, '#7f8c8d')
        return format_html(
            '<span style="background:{};color:#fff;padding:2px 8px;'
            'border-radius:4px;font-size:11px">{}</span>',
            colour,
            obj.get_status_display(),
        )
    status_badge.short_description = 'Status'
    status_badge.admin_order_field = 'status'


@admin.register(AbsenceAlert)
class AbsenceAlertAdmin(admin.ModelAdmin):
    list_display = ('student_col', 'date', 'sms_sent', 'sent_at')
    list_filter = ('sms_sent', 'date')
    search_fields = ('student__first_name', 'student__last_name', 'student__student_id')
    date_hierarchy = 'date'
    ordering = ('-date',)
    readonly_fields = ('sent_at',)

    def student_col(self, obj):
        return f'{obj.student.student_id} — {obj.student.full_name}'
    student_col.short_description = 'Student'
    student_col.admin_order_field = 'student__last_name'
