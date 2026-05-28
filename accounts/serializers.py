import re

from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import AuditLog, Role, SchoolSettings, User


def validate_tz_phone(value: str) -> str:
    """Validate and normalise a Tanzanian phone number to +255XXXXXXXXX."""
    if not value:
        return value
    v = value.strip().replace(' ', '').replace('-', '')
    # Accept local format 07XXXXXXXX → normalise
    if re.match(r'^0\d{9}$', v):
        v = '+255' + v[1:]
    if not re.match(r'^\+255\d{9}$', v):
        raise serializers.ValidationError(
            'Enter a valid Tanzanian number: +255 followed by 9 digits (e.g. +255712345678).'
        )
    return v


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'phone',
            'role', 'profile_photo', 'is_active',
            'date_joined', 'last_login',
        ]
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['email', 'password', 'full_name', 'phone', 'role']

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def validate_phone(self, value):
        return validate_tz_phone(value)

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(username=attrs['email'], password=attrs['password'])
        if not user:
            raise serializers.ValidationError('Invalid email or password.')
        if not user.is_active:
            raise serializers.ValidationError('This account has been deactivated.')
        attrs['user'] = user
        return attrs


# ── Admin serializers ─────────────────────────────────────────────────────────

class AdminUserSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'phone', 'role', 'role_display',
            'profile_photo', 'is_active', 'date_joined', 'last_login',
        ]
        read_only_fields = ['id', 'date_joined', 'last_login']


class AdminUserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['email', 'password', 'full_name', 'phone', 'role']

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value.lower()

    def validate_phone(self, value):
        return validate_tz_phone(value)

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['full_name', 'phone', 'is_active']

    def validate_phone(self, value):
        return validate_tz_phone(value)


class AdminRoleChangeSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Role.choices)
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True)


class AdminPasswordResetSerializer(serializers.Serializer):
    new_password = serializers.CharField(min_length=8, write_only=True)
    notify = serializers.BooleanField(default=True)


class AuditLogSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            'id', 'performed_by', 'performed_by_name', 'action',
            'target_model', 'target_id', 'description',
            'ip_address', 'timestamp', 'extra_data',
        ]
        read_only_fields = fields

    def get_performed_by_name(self, obj):
        return obj.performed_by.full_name if obj.performed_by else 'System'


class SchoolSettingsSerializer(serializers.ModelSerializer):
    email_configured = serializers.BooleanField(read_only=True)
    sms_configured = serializers.BooleanField(read_only=True)

    class Meta:
        model = SchoolSettings
        fields = [
            'id', 'school_name', 'school_motto', 'school_logo',
            'school_address', 'school_phone', 'school_email', 'school_website',
            'region', 'district', 'registration_number', 'school_type',
            'established_year', 'email_configured', 'sms_configured',
        ]
        read_only_fields = ['id', 'email_configured', 'sms_configured']
