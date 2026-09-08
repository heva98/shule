from django.contrib import admin
from django.utils.html import format_html

from .models import (
    AcademicYear,
    ActivityFeePlan,
    FeeAdjustment,
    Invoice,
    InvoiceLine,
    LunchFeeConfig,
    Payment,
    PaymentAllocation,
    StudentCredit,
    TuitionFeePlan,
    UniformFeePlan,
    UniformSaleItem,
)


@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ('year', 'is_current', 'q1_start', 'q2_start', 'q3_start', 'q4_start')
    list_filter = ('is_current',)
    ordering = ('-year',)


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    readonly_fields = ('receipt_number', 'amount', 'payment_method', 'paid_at', 'received_by', 'status')
    fields = ('receipt_number', 'amount', 'payment_method', 'transaction_id', 'paid_at', 'received_by', 'status')
    can_delete = False


class InvoiceLineInline(admin.TabularInline):
    model = InvoiceLine
    extra = 0
    readonly_fields = ('amount_allocated', 'status', 'created_at')
    fields = ('category', 'description', 'amount', 'amount_allocated', 'status', 'is_legacy', 'is_sale')


class FeeAdjustmentInline(admin.TabularInline):
    model = FeeAdjustment
    extra = 0
    fields = ('kind', 'amount', 'reason', 'approved_by', 'created_at')
    readonly_fields = ('created_at',)


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = (
        'student_id_col', 'student_name_col',
        'academic_year', 'kind', 'term', 'quarter',
        'amount_due_col', 'amount_paid_col', 'balance_col',
        'due_date', 'status',
    )
    list_filter = ('status', 'kind', 'term', 'quarter', 'academic_year', 'student__level')
    search_fields = (
        'student__student_id', 'student__first_name', 'student__last_name'
    )
    date_hierarchy = 'created_at'
    readonly_fields = ('amount_due', 'amount_paid', 'status', 'created_at', 'balance_display')
    ordering = ('-academic_year__year', 'term', 'quarter', 'student__last_name')
    inlines = [InvoiceLineInline, PaymentInline]

    fieldsets = (
        ('Student', {'fields': ('student',)}),
        ('Period', {'fields': ('academic_year', 'kind', 'term', 'quarter')}),
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


class PaymentAllocationInline(admin.TabularInline):
    model = PaymentAllocation
    extra = 0
    fields = ('invoice_line', 'amount', 'created_at')
    readonly_fields = ('created_at',)
    autocomplete_fields = ('invoice_line',)


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        'receipt_number', 'student_col',
        'amount_col', 'payment_method', 'status',
        'transaction_id', 'paid_at', 'received_by',
    )
    list_filter = ('payment_method', 'status', 'paid_at', 'received_by')
    search_fields = (
        'receipt_number', 'transaction_id',
        'student__first_name', 'student__last_name', 'student__student_id',
        'invoice__student__first_name', 'invoice__student__last_name',
        'invoice__student__student_id',
    )
    date_hierarchy = 'paid_at'
    readonly_fields = ('receipt_number', 'status', 'reversed_by', 'reversed_at')
    ordering = ('-paid_at',)
    inlines = [PaymentAllocationInline]

    def student_col(self, obj):
        student = obj.student or (obj.invoice.student if obj.invoice_id else None)
        return student.full_name if student else '—'
    student_col.short_description = 'Student'

    def amount_col(self, obj):
        return f'TZS {obj.amount:,.2f}'
    amount_col.short_description = 'Amount'


@admin.register(InvoiceLine)
class InvoiceLineAdmin(admin.ModelAdmin):
    list_display = ('id', 'invoice', 'category', 'amount', 'amount_allocated', 'status', 'is_legacy', 'is_sale')
    list_filter = ('category', 'status', 'is_legacy', 'is_sale')
    search_fields = (
        'invoice__student__student_id', 'invoice__student__first_name',
        'invoice__student__last_name', 'description',
    )
    readonly_fields = ('amount_allocated', 'status', 'created_at')
    inlines = [FeeAdjustmentInline]


@admin.register(StudentCredit)
class StudentCreditAdmin(admin.ModelAdmin):
    list_display = ('student', 'amount', 'remaining_amount', 'source', 'created_at')
    list_filter = ('source',)
    search_fields = ('student__student_id', 'student__first_name', 'student__last_name')
    readonly_fields = ('created_at',)


@admin.register(UniformSaleItem)
class UniformSaleItemAdmin(admin.ModelAdmin):
    list_display = ('invoice_line', 'name', 'qty', 'unit_price')
    search_fields = ('name',)


@admin.register(TuitionFeePlan)
class TuitionFeePlanAdmin(admin.ModelAdmin):
    list_display = ('academic_year', 'scope', 'level_group', 'level', 'amount', 'is_active')
    list_filter = ('academic_year', 'scope', 'is_active', 'level_group')


@admin.register(UniformFeePlan)
class UniformFeePlanAdmin(admin.ModelAdmin):
    list_display = ('academic_year', 'level', 'amount', 'is_active')
    list_filter = ('academic_year', 'is_active', 'level')


@admin.register(LunchFeeConfig)
class LunchFeeConfigAdmin(admin.ModelAdmin):
    list_display = ('academic_year', 'term', 'quarter', 'day_amount', 'boarding_amount', 'is_active')
    list_filter = ('academic_year', 'term', 'quarter', 'is_active')


@admin.register(ActivityFeePlan)
class ActivityFeePlanAdmin(admin.ModelAdmin):
    list_display = ('academic_year', 'term', 'quarter', 'level', 'amount', 'is_active')
    list_filter = ('academic_year', 'term', 'quarter', 'is_active', 'level')
