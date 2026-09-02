from django.contrib import admin
from django.utils.html import format_html

from .models import (
    DemoRequest,
    DeliveryStatus,
    Message,
    MessageLog,
    SmsBatch,
    SmsConfiguration,
    SmsMessage,
    SmsTemplate,
)


class MessageLogInline(admin.TabularInline):
    model = MessageLog
    extra = 0
    readonly_fields = (
        'recipient_name', 'recipient_phone', 'recipient_email',
        'status_badge', 'whatsapp_link', 'sent_at',
    )
    fields = (
        'recipient_name', 'recipient_phone', 'recipient_email',
        'status_badge', 'whatsapp_link', 'sent_at',
    )
    can_delete = False

    _STATUS_COLOURS = {
        DeliveryStatus.PENDING: '#f39c12',
        DeliveryStatus.SENT: '#27ae60',
        DeliveryStatus.FAILED: '#e74c3c',
    }

    def status_badge(self, obj):
        colour = self._STATUS_COLOURS.get(obj.status, '#7f8c8d')
        return format_html(
            '<span style="background:{};color:#fff;padding:2px 6px;'
            'border-radius:4px;font-size:11px">{}</span>',
            colour, obj.get_status_display(),
        )
    status_badge.short_description = 'Status'

    def whatsapp_link(self, obj):
        if obj.whatsapp_url:
            return format_html(
                '<a href="{}" target="_blank">Open WhatsApp</a>', obj.whatsapp_url
            )
        return '—'
    whatsapp_link.short_description = 'WhatsApp'


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = (
        'subject_col', 'message_type', 'audience',
        'sent_by', 'sent_at',
        'total_recipients', 'delivered_count', 'rate_col',
    )
    list_filter = ('message_type', 'audience', 'sent_at')
    search_fields = ('subject', 'body', 'sent_by__full_name')
    date_hierarchy = 'sent_at'
    readonly_fields = (
        'sent_by', 'sent_at', 'total_recipients', 'delivered_count',
    )
    ordering = ('-sent_at',)
    inlines = [MessageLogInline]

    fieldsets = (
        ('Content', {'fields': ('subject', 'body', 'message_type')}),
        ('Audience', {'fields': ('audience', 'target_level', 'target_stream', 'target_student')}),
        ('Meta', {'fields': ('sent_by', 'sent_at', 'total_recipients', 'delivered_count')}),
    )

    def subject_col(self, obj):
        return obj.subject or obj.body[:50]
    subject_col.short_description = 'Subject / Body'

    def rate_col(self, obj):
        rate = obj.delivery_rate
        colour = '#27ae60' if rate >= 80 else ('#f39c12' if rate >= 50 else '#e74c3c')
        return format_html(
            '<span style="color:{};font-weight:bold">{}%</span>', colour, rate
        )
    rate_col.short_description = 'Delivery Rate'


@admin.register(MessageLog)
class MessageLogAdmin(admin.ModelAdmin):
    list_display = (
        'recipient_name', 'recipient_phone', 'recipient_email',
        'status', 'sent_at', 'message',
    )
    list_filter = ('status', 'sent_at')
    search_fields = ('recipient_name', 'recipient_phone', 'recipient_email')
    date_hierarchy = 'sent_at'
    readonly_fields = ('sent_at', 'provider_response', 'whatsapp_url')
    ordering = ('-sent_at',)


@admin.register(DemoRequest)
class DemoRequestAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'email', 'phone', 'school_name', 'contacted', 'created_at')
    list_filter = ('contacted', 'created_at')
    search_fields = ('full_name', 'email', 'phone', 'school_name')
    date_hierarchy = 'created_at'
    readonly_fields = ('full_name', 'email', 'phone', 'school_name', 'message', 'created_at')
    ordering = ('-created_at',)


# ── SMS ─────────────────────────────────────────────────────────────────────

@admin.register(SmsConfiguration)
class SmsConfigurationAdmin(admin.ModelAdmin):
    list_display = (
        'language', 'allow_exam_results', 'allow_fee_reminders', 'allow_announcements',
        'auto_payment_thank_you', 'auto_term_dates', 'updated_at',
    )

    def has_add_permission(self, request):
        # Singleton — edit the one row (created on first access).
        return not SmsConfiguration.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SmsTemplate)
class SmsTemplateAdmin(admin.ModelAdmin):
    list_display = ('key', 'language', 'is_active', 'updated_at', 'updated_by')
    list_filter = ('key', 'language', 'is_active')
    search_fields = ('body',)
    readonly_fields = ('updated_at',)

    def save_model(self, request, obj, form, change):
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)


class SmsMessageInline(admin.TabularInline):
    model = SmsMessage
    extra = 0
    can_delete = False
    fields = (
        'recipient_name', 'recipient_phone', 'status', 'skip_reason',
        'segments', 'cost', 'provider_message_id', 'sent_at',
    )
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(SmsBatch)
class SmsBatchAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'kind', 'status', 'dry_run', 'created_by', 'created_at',
        'total_recipients', 'sent_count', 'failed_count', 'skipped_count',
        'total_segments', 'total_cost',
    )
    list_filter = ('kind', 'status', 'dry_run', 'created_at')
    search_fields = ('created_by__full_name', 'idempotency_key', 'template_key')
    date_hierarchy = 'created_at'
    readonly_fields = (
        'kind', 'status', 'template', 'template_key', 'language', 'sender_id',
        'created_by', 'context', 'dry_run', 'idempotency_key',
        'total_recipients', 'sent_count', 'failed_count', 'skipped_count',
        'total_segments', 'total_cost', 'created_at', 'queued_at', 'completed_at',
    )
    inlines = [SmsMessageInline]

    def has_add_permission(self, request):
        return False


@admin.register(SmsMessage)
class SmsMessageAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'batch', 'recipient_name', 'recipient_phone', 'status',
        'segments', 'cost', 'provider_message_id', 'sent_at',
    )
    list_filter = ('status', 'created_at', 'batch__kind')
    search_fields = ('recipient_phone', 'recipient_name', 'provider_message_id')
    date_hierarchy = 'created_at'
    readonly_fields = (
        'batch', 'student', 'guardian', 'recipient_name', 'recipient_phone',
        'body', 'sender_id', 'status', 'skip_reason', 'error_detail',
        'provider_message_id', 'provider_status', 'provider_response',
        'segments', 'cost', 'sent_by', 'created_at', 'sent_at', 'updated_at',
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
