from rest_framework import serializers

from accounts.serializers import UserSerializer

from .models import LeaveRequest, LeaveStatus, StaffProfile


class StaffProfileSerializer(serializers.ModelSerializer):
    user_detail = UserSerializer(source='user', read_only=True)
    subjects_display = serializers.SerializerMethodField()
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)

    class Meta:
        model = StaffProfile
        fields = [
            'id', 'user', 'user_detail', 'employee_id',
            'full_name', 'email', 'phone',
            'tsc_number', 'designation',
            'subjects', 'subjects_display',
            'class_teacher_of_level', 'class_teacher_of_stream',
            'hire_date', 'contract_type', 'basic_salary',
            'national_id', 'qualifications',
            'emergency_contact_name', 'emergency_contact_phone',
        ]
        read_only_fields = ['id', 'employee_id']

    def get_subjects_display(self, obj):
        return [
            {'id': s.id, 'code': s.code, 'name': s.name}
            for s in obj.subjects.all()
        ]


class StaffProfileWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffProfile
        fields = [
            'user', 'tsc_number', 'designation', 'subjects',
            'class_teacher_of_level', 'class_teacher_of_stream',
            'hire_date', 'contract_type', 'basic_salary',
            'national_id', 'qualifications',
            'emergency_contact_name', 'emergency_contact_phone',
        ]

    def validate_qualifications(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Qualifications must be a list.')
        required_keys = {'degree', 'institution', 'year_completed'}
        for i, item in enumerate(value):
            missing = required_keys - set(item.keys())
            if missing:
                raise serializers.ValidationError(
                    f'Item {i}: missing keys {missing}.'
                )
        return value


class LeaveRequestSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.user.full_name', read_only=True)
    employee_id = serializers.CharField(source='staff.employee_id', read_only=True)
    reviewed_by_name = serializers.CharField(
        source='reviewed_by.full_name', read_only=True, default=None
    )

    class Meta:
        model = LeaveRequest
        fields = [
            'id', 'staff', 'staff_name', 'employee_id',
            'leave_type', 'start_date', 'end_date', 'days_requested',
            'reason', 'status', 'applied_at',
            'reviewed_by', 'reviewed_by_name', 'reviewed_at',
        ]
        read_only_fields = [
            'id', 'status', 'applied_at',
            'reviewed_by', 'reviewed_at',
        ]

    def validate(self, attrs):
        start = attrs.get('start_date')
        end = attrs.get('end_date')
        if start and end and end < start:
            raise serializers.ValidationError(
                {'end_date': 'End date cannot be before start date.'}
            )
        return attrs


class LeaveReviewSerializer(serializers.Serializer):
    """Used for approve / reject actions — accepts optional review notes."""
    notes = serializers.CharField(required=False, allow_blank=True)
