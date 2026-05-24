from django.contrib import admin
from django.utils.html import format_html

from .models import AcademicYear, FeeStructure, Invoice, Payment


@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ('year', 'is_current', 'q1_start', 'q2_start', 'q3_start', 'q4_start')
    list_filter = ('is_current',)
    ordering = ('-year',)


@admin.register(FeeStructure)
class FeeStructureAdmin(admin.ModelAdmin):
    list_display = (
        'academic_year', 'level', 'term', 'quarter',
        'tuition_fee', 'lunch_fee', 'transport_fee',
        'uniform_fee', 'activity_fee', 'display_total',
    )
    list_filter = ('academic_year', 'level', 'term', 'quarter')
    ordering = ('-academic_year__year', 'level', 'term', 'quarter')

    def display_total(self, obj):
        return f'TZS {obj.total_fee:,.2f}'
    display_total.short_description = 'Total Fee'


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    readonly_fields = ('receipt_number', 'amount', 'payment_method', 'paid_at', 'received_by')
    fields = ('receipt_number', 'amount', 'payment_method', 'transaction_id', 'paid_at', 'received_by')
    can_delete = False


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = (
        'student_id_col', 'student_name_col',
        'academic_year', 'term', 'quarter',
        'amount_due_col', 'amount_paid_col', 'balance_col',
        'due_date', 'status',
    )
    list_filter = ('status', 'term', 'quarter', 'academic_year', 'student__level')
    search_fields = (
        'student__student_id', 'student__first_name', 'student__last_name'
    )
    date_hierarchy = 'created_at'
    readonly_fields = ('amount_paid', 'status', 'created_at', 'balance_display')
    ordering = ('-academic_year__year', 'term', 'quarter', 'student__last_name')
    inlines = [PaymentInline]

    fieldsets = (
        ('Student', {'fields': ('student',)}),
        ('Period', {'fields': ('academic_year', 'term', 'quarter')}),
        ('Amounts (TZS)', {'fields': ('amount_due', 'amount_paid', 'balance_display')}),
        ('Status', {'fields': ('status', 'due_date', 'notes')}),
        ('Timestamps', {'fields': ('created_at',), 'classes': ('collapse',)}),
    )

    def student_id_col(self, obj):
        return obj.student.student_id
    student_id_col.short_description = 'Student ID'
    student_id_col.admin_order_field = 'student__student_id'

    def student_name_col(self, obj):
        return obj.student.full_name
    student_name_col.short_description = 'Student Name'
    student_name_col.admin_order_field = 'student__last_name'

    def amount_due_col(self, obj):
        return f'{obj.amount_due:,.2f}'
    amount_due_col.short_description = 'Due (TZS)'

    def amount_paid_col(self, obj):
        return f'{obj.amount_paid:,.2f}'
    amount_paid_col.short_description = 'Paid (TZS)'

    def balance_col(self, obj):
        bal = obj.balance
        colour = 'red' if bal > 0 else 'green'
        return format_html('<span style="color:{}">{:,.2f}</span>', colour, bal)
    balance_col.short_description = 'Balance (TZS)'

    def balance_display(self, obj):
        return f'TZS {obj.balance:,.2f}'
    balance_display.short_description = 'Balance'


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        'receipt_number', 'student_col',
        'amount_col', 'payment_method',
        'transaction_id', 'paid_at', 'received_by',
    )
    list_filter = ('payment_method', 'paid_at', 'received_by')
    search_fields = (
        'receipt_number', 'transaction_id',
        'invoice__student__first_name', 'invoice__student__last_name',
        'invoice__student__student_id',
    )
    date_hierarchy = 'paid_at'
    readonly_fields = ('receipt_number',)
    ordering = ('-paid_at',)

    def student_col(self, obj):
        return obj.invoice.student.full_name
    student_col.short_description = 'Student'

    def amount_col(self, obj):
        return f'TZS {obj.amount:,.2f}'
    amount_col.short_description = 'Amount'
