from rest_framework import serializers

from .models import DemoRequest, Message, MessageLog


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
