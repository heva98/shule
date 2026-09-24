from django.contrib import admin

from .models import Enrolment, Guardian, Student


class GuardianInline(admin.TabularInline):
    model = Guardian
    extra = 1
    fields = ('full_name', 'relationship', 'phone', 'whatsapp_phone', 'is_primary_contact')


class EnrolmentInline(admin.TabularInline):
    # History is written by students.enrolment, never by hand.
    model = Enrolment
    extra = 0
    can_delete = False
    fields = ('academic_year', 'level', 'stream', 'status', 'enrolled_on', 'left_on')
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ('student_id', 'full_name', 'level', 'stream', 'status', 'gender', 'admission_date')
    list_filter = ('level', 'stream', 'status', 'gender', 'has_special_needs')
    search_fields = ('first_name', 'last_name', 'student_id', 'nemis_id')
    date_hierarchy = 'admission_date'
    readonly_fields = ('student_id', 'created_at', 'updated_at')
    ordering = ('last_name', 'first_name')
    inlines = [GuardianInline, EnrolmentInline]

    fieldsets = (
        ('Identity', {
            'fields': ('student_id', 'nemis_id', 'first_name', 'middle_name', 'last_name', 'photo'),
        }),
        ('Personal', {
            'fields': ('date_of_birth', 'gender'),
        }),
        ('Enrolment', {
            'fields': ('level', 'stream', 'admission_date', 'status'),
        }),
        ('Special Needs', {
            'fields': ('has_special_needs', 'special_needs_notes'),
            'classes': ('collapse',),
        }),
        ('Portal Access', {
            'fields': ('user',),
            'classes': ('collapse',),
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )

    def full_name(self, obj):
        return obj.full_name
    full_name.short_description = 'Full Name'
    full_name.admin_order_field = 'last_name'


@admin.register(Guardian)
class GuardianAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'relationship', 'phone', 'student', 'is_primary_contact')
    list_filter = ('relationship', 'is_primary_contact')
    search_fields = ('full_name', 'phone', 'student__first_name', 'student__last_name')
    raw_id_fields = ('student',)


@admin.register(Enrolment)
class EnrolmentAdmin(admin.ModelAdmin):
    list_display = ('student', 'academic_year', 'level', 'stream', 'status', 'enrolled_on', 'left_on')
    list_filter = ('academic_year', 'level', 'status')
    search_fields = ('student__first_name', 'student__last_name', 'student__student_id')
    list_select_related = ('student', 'academic_year')
    raw_id_fields = ('student',)
