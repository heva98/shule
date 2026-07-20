from django.contrib import admin

from .models import HomePackage


@admin.register(HomePackage)
class HomePackageAdmin(admin.ModelAdmin):
    list_display = ('title', 'level', 'stream', 'subject', 'quarter', 'academic_year', 'due_date', 'posted_by')
    list_filter = ('academic_year', 'quarter', 'level')
    search_fields = ('title', 'subject__name', 'posted_by__full_name')
    ordering = ('-academic_year', '-quarter', '-created_at')
