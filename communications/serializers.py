from rest_framework import serializers

from .models import (
    DemoRequest,
    Message,
    MessageLog,
    SmsBatch,
    SmsConfiguration,
    SmsMessage,
    SmsTemplate,
)


class MessageLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageLog
        fields = [
            'id', 'recipient_name', 'recipient_phone', 'recipient_email',
            'status', 'whatsapp_url', 'provider_response', 'sent_at',
        ]
        read_only_fields = fields


class MessageSerializer(serializers.ModelSerializer):
    sent_by_name = serializers.CharField(source='sent_by.full_name', read_only=True, default=None)
    delivery_rate = serializers.FloatField(read_only=True)
    logs = MessageLogSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = [
            'id', 'subject', 'body', 'message_type', 'audience',
            'target_level', 'target_stream', 'target_student',
            'sent_by', 'sent_by_name', 'sent_at',
            'total_recipients', 'delivered_count', 'delivery_rate',
            'logs',
        ]
        read_only_fields = [
            'id', 'sent_by', 'sent_at',
            'total_recipients', 'delivered_count',
        ]


class BroadcastSerializer(serializers.ModelSerializer):
    """Write serializer for POST /api/communications/broadcast/."""
    class Meta:
        model = Message
        fields = [
            'subject', 'body', 'message_type', 'audience',
            'target_level', 'target_stream', 'target_student',
        ]

    def validate(self, attrs):
        if attrs.get('message_type') == 'WHATSAPP':
            raise serializers.ValidationError(
                {'message_type': 'WhatsApp sending is not connected yet — use Email.'}
            )
        audience = attrs.get('audience')
        if audience == 'LEVEL' and not attrs.get('target_level'):
            raise serializers.ValidationError(
                {'target_level': 'Required when audience is LEVEL.'}
            )
        if audience == 'CLASS' and not attrs.get('target_level'):
            raise serializers.ValidationError(
                {'target_level': 'Required when audience is CLASS.'}
            )
        if audience == 'INDIVIDUAL' and not attrs.get('target_student'):
            raise serializers.ValidationError(
                {'target_student': 'Required when audience is INDIVIDUAL.'}
            )
        return attrs


class DemoRequestSerializer(serializers.ModelSerializer):
    """Write serializer for the public POST /api/communications/demo-requests/."""
    class Meta:
        model = DemoRequest
        fields = ['full_name', 'email', 'phone', 'school_name', 'message']


# ── SMS ─────────────────────────────────────────────────────────────────────

class SmsConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = SmsConfiguration
        fields = [
            'language',
            'allow_exam_results', 'allow_fee_reminders', 'allow_announcements',
            'auto_payment_thank_you', 'auto_term_dates',
            'batch_recipient_cap', 'max_segments',
            'effective_recipient_cap', 'effective_max_segments',
            'updated_at',
        ]
        read_only_fields = ['effective_recipient_cap', 'effective_max_segments', 'updated_at']


class SmsTemplateSerializer(serializers.ModelSerializer):
    key_display = serializers.CharField(source='get_key_display', read_only=True)
    placeholders = serializers.SerializerMethodField()

    class Meta:
        model = SmsTemplate
        fields = [
            'id', 'key', 'key_display', 'language', 'body', 'is_active',
            'placeholders', 'updated_at', 'updated_by',
        ]
        read_only_fields = ['id', 'key', 'language', 'updated_at', 'updated_by']

    def get_placeholders(self, obj):
        from .sms_templates import TemplateSyntaxError, placeholders
        try:
            return placeholders(obj.body)
        except TemplateSyntaxError:
            return []

    def validate_body(self, value):
        from .sms_templates import TemplateSyntaxError, placeholders
        try:
            placeholders(value)
        except TemplateSyntaxError as exc:
            raise serializers.ValidationError(f'Template syntax error: {exc}')
        if not value.strip():
            raise serializers.ValidationError('Template body cannot be empty.')
        return value


class SmsMessageSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True, default=None)
    student_admission_no = serializers.CharField(source='student.student_id', read_only=True, default=None)

    class Meta:
        model = SmsMessage
        fields = [
            'id', 'student', 'student_name', 'student_admission_no',
            'recipient_name', 'recipient_phone', 'body', 'status',
            'skip_reason', 'error_detail', 'provider_message_id', 'provider_status',
            'segments', 'cost', 'created_at', 'sent_at',
        ]
        read_only_fields = fields


class SmsBatchListSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True, default=None)
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)

    class Meta:
        model = SmsBatch
        fields = [
            'id', 'kind', 'kind_display', 'status', 'dry_run',
            'template_key', 'language', 'created_by', 'created_by_name',
            'total_recipients', 'sent_count', 'failed_count', 'skipped_count',
            'total_segments', 'total_cost',
            'created_at', 'queued_at', 'completed_at',
        ]
        read_only_fields = fields


class SmsBatchDetailSerializer(SmsBatchListSerializer):
    messages = SmsMessageSerializer(many=True, read_only=True)
    context = serializers.JSONField(read_only=True)

    class Meta(SmsBatchListSerializer.Meta):
        fields = SmsBatchListSerializer.Meta.fields + ['context', 'sender_id', 'messages']
        read_only_fields = fields
