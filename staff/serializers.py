from rest_framework import serializers

from accounts.serializers import UserSerializer

from .models import (
    ClassTeacherAssignment,
    DisciplinaryIncident,
    LeaveRequest,
    LeaveStatus,
    StaffProfile,
)


class StaffProfileSerializer(serializers.ModelSerializer):
    user_detail      = UserSerializer(source='user', read_only=True)
    subjects_display = serializers.SerializerMethodField()
    full_name        = serializers.CharField(source='user.full_name', read_only=True)
    email            = serializers.EmailField(source='user.email', read_only=True)
    phone            = serializers.CharField(source='user.phone', read_only=True)
    role             = serializers.CharField(source='user.role', read_only=True)
    current_class    = serializers.SerializerMethodField()

    class Meta:
        model = StaffProfile
        fields = [
            'id', 'user', 'user_detail', 'employee_id',
            'full_name', 'email', 'phone', 'role',
            'tsc_number', 'designation',
            'subjects', 'subjects_display',
            'class_teacher_of_level', 'class_teacher_of_stream',
            'current_class',
            'taught_levels',
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

    def get_current_class(self, obj):
        assignment = obj.current_class_assignment
        if not assignment:
            return None
        return {
            'level': assignment.level,
            'stream': assignment.stream,
            'academic_year': str(assignment.academic_year),
        }


class StaffProfileWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffProfile
        fields = [
            'user', 'tsc_number', 'designation', 'subjects',
            'class_teacher_of_level', 'class_teacher_of_stream',
            'taught_levels',
            'hire_date', 'contract_type', 'basic_salary',
            'national_id', 'qualifications',
            'emergency_contact_name', 'emergency_contact_phone',
        ]

    def validate_qualifications(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Qualifications must be a list.')
        required_keys = {'degree', 'institution', 'year_completed'}
        allowed_keys  = required_keys | {'program'}
        for i, item in enumerate(value):
            missing = required_keys - set(item.keys())
            if missing:
                raise serializers.ValidationError(
                    f'Item {i}: missing keys {missing}.'
                )
            extra = set(item.keys()) - allowed_keys
            if extra:
                raise serializers.ValidationError(
                    f'Item {i}: unexpected keys {extra}.'
                )
        return value


class LeaveRequestSerializer(serializers.ModelSerializer):
    staff_name       = serializers.CharField(source='staff.user.full_name', read_only=True)
    employee_id      = serializers.CharField(source='staff.employee_id', read_only=True)
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
        end   = attrs.get('end_date')
        if start and end and end < start:
            raise serializers.ValidationError(
                {'end_date': 'End date cannot be before start date.'}
            )
        return attrs


class LeaveReviewSerializer(serializers.Serializer):
    """Used for approve / reject actions — accepts optional review notes."""
    notes = serializers.CharField(required=False, allow_blank=True)


class ClassTeacherAssignmentSerializer(serializers.ModelSerializer):
    teacher_name  = serializers.CharField(source='teacher.user.full_name', read_only=True)
    employee_id   = serializers.CharField(source='teacher.employee_id', read_only=True)
    year_label    = serializers.CharField(source='academic_year.year', read_only=True)
    assigned_by_name = serializers.CharField(source='assigned_by.full_name', read_only=True)

    class Meta:
        model = ClassTeacherAssignment
        fields = [
            'id', 'teacher', 'teacher_name', 'employee_id',
            'level', 'stream', 'academic_year', 'year_label',
            'assigned_by', 'assigned_by_name', 'assigned_at', 'is_active',
        ]
        read_only_fields = ['id', 'assigned_by', 'assigned_at', 'is_active']


class ClassTeacherAssignmentCreateSerializer(serializers.Serializer):
    teacher_id       = serializers.IntegerField()
    level            = serializers.CharField(max_length=10)
    stream           = serializers.CharField(max_length=10)
    academic_year_id = serializers.IntegerField()

    def validate_teacher_id(self, value):
        try:
            return StaffProfile.objects.select_related('user').get(pk=value)
        except StaffProfile.DoesNotExist:
            raise serializers.ValidationError(f'Staff profile id={value} not found.')

    def validate(self, attrs):
        from fees.models import AcademicYear
        try:
            attrs['academic_year'] = AcademicYear.objects.get(pk=attrs['academic_year_id'])
        except AcademicYear.DoesNotExist:
            raise serializers.ValidationError(
                {'academic_year_id': 'Academic year not found.'}
            )
        # Check for existing active assignment for this class
        existing = ClassTeacherAssignment.objects.filter(
            level=attrs['level'],
            stream=attrs['stream'],
            academic_year=attrs['academic_year'],
            is_active=True,
        ).first()
        if existing:
            raise serializers.ValidationError(
                f'{attrs["level"]}{attrs["stream"]} already has an active class teacher '
                f'({existing.teacher.user.full_name}) for {attrs["academic_year"]}.'
            )
        return attrs


class DisciplinaryIncidentSerializer(serializers.ModelSerializer):
    student_name   = serializers.CharField(source='student.full_name', read_only=True)
    student_id_no  = serializers.CharField(source='student.student_id', read_only=True)
    reported_by_name = serializers.CharField(source='reported_by.user.full_name', read_only=True)
    referred_to_name = serializers.CharField(
        source='referred_to.full_name', read_only=True, default=None
    )

    class Meta:
        model = DisciplinaryIncident
        fields = [
            'id', 'student', 'student_name', 'student_id_no',
            'reported_by', 'reported_by_name',
            'date', 'incident_type', 'description', 'severity',
            'status', 'action_taken',
            'referred_to', 'referred_to_name', 'referred_at',
            'resolved_at', 'created_at',
        ]
        read_only_fields = [
            'id', 'reported_by', 'status',
            'referred_to', 'referred_at', 'resolved_at', 'created_at',
        ]


class DisciplinaryReferSerializer(serializers.Serializer):
    """Body for the /refer/ action."""
    notes = serializers.CharField(required=False, allow_blank=True)
