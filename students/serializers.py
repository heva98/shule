from rest_framework import serializers

from .models import Guardian, Student


class GuardianSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guardian
        fields = [
            'id', 'student', 'full_name', 'relationship',
            'phone', 'whatsapp_phone', 'email',
            'national_id', 'is_primary_contact',
        ]
        read_only_fields = ['id']

    def validate(self, attrs):
        student = attrs.get('student') or (
            self.instance.student if self.instance else None
        )
        # Enforce only one primary contact per student
        if attrs.get('is_primary_contact') and student:
            qs = Guardian.objects.filter(student=student, is_primary_contact=True)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {'is_primary_contact': 'A primary contact is already set for this student.'}
                )
        return attrs


class GuardianInlineSerializer(serializers.ModelSerializer):
    """Compact guardian representation embedded inside StudentSerializer."""
    class Meta:
        model = Guardian
        fields = [
            'id', 'full_name', 'relationship',
            'phone', 'whatsapp_phone', 'is_primary_contact',
        ]


class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    guardians = GuardianInlineSerializer(many=True, read_only=True)

    class Meta:
        model = Student
        fields = [
            'id', 'public_id', 'student_id', 'nemis_id',
            'first_name', 'last_name', 'middle_name', 'full_name',
            'date_of_birth', 'gender',
            'photo', 'level', 'stream',
            'admission_date', 'status',
            'has_special_needs', 'special_needs_notes',
            'user', 'guardians',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'public_id', 'student_id', 'full_name', 'created_at', 'updated_at']


class StudentWriteSerializer(serializers.ModelSerializer):
    """Separate write serializer — excludes computed/read-only fields.
    id/public_id/student_id are included read-only so the frontend can redirect
    to the new record (by public_id) after creation."""
    class Meta:
        model = Student
        fields = [
            'id', 'public_id', 'student_id', 'nemis_id', 'first_name', 'last_name', 'middle_name',
            'date_of_birth', 'gender', 'photo', 'level', 'stream',
            'admission_date', 'status',
            'has_special_needs', 'special_needs_notes', 'user',
        ]
        read_only_fields = ['id', 'public_id', 'student_id']
