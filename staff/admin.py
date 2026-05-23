from django.contrib import admin
from django.utils.html import format_html

from .models import LeaveRequest, LeaveStatus, StaffProfile


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    list_display = (
        'employee_id', 'full_name_col', 'designation',
        'contract_type', 'class_assignment_col', 'hire_date',
    )
    list_filter = ('designation', 'contract_type', 'class_teacher_of_level')
    search_fields = (
        'employee_id', 'tsc_number',
        'user__full_name', 'user__email',
        'national_id',
    )
    readonly_fields = ('employee_id',)
    filter_horizontal = ('subjects',)
    ordering = ('user__full_name',)

    fieldsets = (
        ('Account', {'fields': ('user', 'employee_id')}),
        ('Professional', {
            'fields': (
                'tsc_number', 'designation', 'subjects',
                'class_teacher_of_level', 'class_teacher_of_stream',
            ),
        }),
        ('Employment', {
            'fields': ('hire_date', 'contract_type', 'basic_salary', 'national_id'),
        }),
        ('Qualifications', {
            'fields': ('qualifications',),
            'classes': ('collapse',),
        }),
        ('Emergency Contact', {
            'fields': ('emergency_contact_name', 'emergency_contact_phone'),
            'classes': ('collapse',),
        }),
    )

    def full_name_col(self, obj):
        return obj.user.full_name
    full_name_col.short_description = 'Name'
    full_name_col.admin_order_field = 'user__full_name'

    def class_assignment_col(self, obj):
        if obj.class_teacher_of_level:
            stream = f' {obj.class_teacher_of_stream}' if obj.class_teacher_of_stream else ''
            return f'{obj.class_teacher_of_level}{stream}'
        return '—'
    class_assignment_col.short_description = 'Class'


_STATUS_COLOURS = {
    LeaveStatus.PENDING: '#f39c12',
    LeaveStatus.APPROVED: '#27ae60',
    LeaveStatus.REJECTED: '#e74c3c',
}


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = (
        'staff_col', 'leave_type', 'start_date', 'end_date',
        'days_requested', 'status_badge', 'applied_at', 'reviewed_by',
    )
    list_filter = ('status', 'leave_type', 'staff__designation')
    search_fields = (
        'staff__employee_id',
        'staff__user__full_name',
    )
    date_hierarchy = 'start_date'
    readonly_fields = ('applied_at', 'reviewed_at', 'reviewed_by')
    ordering = ('-applied_at',)

    fieldsets = (
        ('Request', {'fields': ('staff', 'leave_type', 'start_date', 'end_date', 'days_requested', 'reason')}),
        ('Decision', {'fields': ('status', 'reviewed_by', 'reviewed_at')}),
        ('Timestamps', {'fields': ('applied_at',), 'classes': ('collapse',)}),
    )

    def staff_col(self, obj):
        return f'{obj.staff.employee_id} — {obj.staff.user.full_name}'
    staff_col.short_description = 'Staff'
    staff_col.admin_order_field = 'staff__user__full_name'

    def status_badge(self, obj):
        colour = _STATUS_COLOURS.get(obj.status, '#7f8c8d')
        return format_html(
            '<span style="background:{};color:#fff;padding:2px 8px;'
            'border-radius:4px;font-size:11px">{}</span>',
            colour,
            obj.get_status_display(),
        )
    status_badge.short_description = 'Status'
    status_badge.admin_order_field = 'status'
