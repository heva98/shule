from rest_framework import serializers

from students.models import Student

from .models import AbsenceAlert, AttendanceRecord, AttendanceStatus, Session


class AttendanceRecordSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_id_display = serializers.CharField(source='student.student_id', read_only=True)
    marked_by_name = serializers.CharField(source='marked_by.full_name', read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = [
            'id', 'student', 'student_id_display', 'student_name',
            'date', 'session', 'status', 'reason',
            'marked_by', 'marked_by_name', 'marked_at',
        ]
        read_only_fields = ['id', 'marked_by', 'marked_at']


# ── Bulk submission ──────────────────────────────────────────────────────────

class BulkRecordItemSerializer(serializers.Serializer):
    student_id = serializers.CharField()
    status = serializers.ChoiceField(choices=AttendanceStatus.choices)
    reason = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_student_id(self, value):
        try:
            return Student.objects.get(student_id=value)
        except Student.DoesNotExist:
            raise serializers.ValidationError(f'Student "{value}" not found.')


class BulkAttendanceSerializer(serializers.Serializer):
    date = serializers.DateField()
    session = serializers.ChoiceField(choices=Session.choices)
    level = serializers.CharField(required=False, allow_blank=True)
    stream = serializers.CharField(required=False, allow_blank=True)
    records = BulkRecordItemSerializer(many=True, min_length=1)


# ── Summary ──────────────────────────────────────────────────────────────────

class AttendanceSummarySerializer(serializers.Serializer):
    total_days = serializers.IntegerField()
    present = serializers.IntegerField()
    absent = serializers.IntegerField()
    late = serializers.IntegerField()
    excused = serializers.IntegerField()
    attendance_percent = serializers.DecimalField(max_digits=5, decimal_places=2)


# ── Absentee list ─────────────────────────────────────────────────────────────

class AbsenteeSerializer(serializers.Serializer):
    student_id = serializers.CharField()
    student_name = serializers.CharField()
    level = serializers.CharField()
    stream = serializers.CharField()
    guardian_name = serializers.CharField()
    guardian_phone = serializers.CharField()
    reason = serializers.CharField()
