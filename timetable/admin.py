from django.contrib import admin

from .models import Period, TimetableEntry


@admin.register(Period)
class PeriodAdmin(admin.ModelAdmin):
    list_display = ('name', 'start_time', 'end_time', 'order', 'is_break')
    list_filter = ('is_break',)
    ordering = ('order',)


@admin.register(TimetableEntry)
class TimetableEntryAdmin(admin.ModelAdmin):
    list_display = (
        'level', 'stream', 'day_of_week', 'period', 'subject', 'teacher', 'room', 'academic_year',
    )
    list_filter = ('academic_year', 'day_of_week', 'level')
    search_fields = ('level', 'stream', 'subject__name', 'teacher__user__full_name', 'room')
    ordering = ('academic_year', 'level', 'stream', 'day_of_week', 'period__order')
