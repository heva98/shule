from django.contrib import admin

from .models import BoardingAssignment, Dormitory


@admin.register(Dormitory)
class DormitoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'gender', 'capacity', 'occupied_count', 'warden')
    list_filter = ('gender',)
    search_fields = ('name',)
    ordering = ('name',)


@admin.register(BoardingAssignment)
class BoardingAssignmentAdmin(admin.ModelAdmin):
    list_display = ('student', 'dormitory', 'academic_year', 'bed_number', 'is_active', 'assigned_at')
    list_filter = ('academic_year', 'is_active', 'dormitory')
    search_fields = ('student__first_name', 'student__last_name', 'student__student_id', 'dormitory__name')
    ordering = ('-is_active', 'dormitory__name')
