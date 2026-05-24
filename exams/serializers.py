from rest_framework import serializers

from students.models import Student

from .models import Exam, MarkEntry, Subject


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ['id', 'name', 'code', 'level_group', 'is_compulsory']


class ExamSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)

    class Meta:
        model = Exam
        fields = [
            'id', 'name', 'academic_year', 'term', 'quarter', 'level', 'stream',
            'exam_type', 'start_date', 'end_date',
            'created_by', 'created_by_name',
        ]
        read_only_fields = ['id', 'created_by']


class MarkEntrySerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_id_display = serializers.CharField(source='student.student_id', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)

    class Meta:
        model = MarkEntry
        fields = [
            'id', 'exam', 'student', 'student_id_display', 'student_name',
            'subject', 'subject_name', 'subject_code',
            'score', 'grade', 'remarks', 'entered_by',
        ]
        read_only_fields = ['id', 'grade', 'entered_by']


# ── Bulk mark submission ──────────────────────────────────────────────────────

class BulkMarkItemSerializer(serializers.Serializer):
    student_id = serializers.CharField()
    subject_id = serializers.IntegerField()
    score = serializers.DecimalField(max_digits=5, decimal_places=2)
    remarks = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_student_id(self, value):
        try:
            return Student.objects.get(student_id=value)
        except Student.DoesNotExist:
            raise serializers.ValidationError(f'Student "{value}" not found.')

    def validate_subject_id(self, value):
        try:
            return Subject.objects.get(pk=value)
        except Subject.DoesNotExist:
            raise serializers.ValidationError(f'Subject id={value} not found.')

    def validate_score(self, value):
        if not (0 <= value <= 100):
            raise serializers.ValidationError('Score must be between 0 and 100.')
        return value


class BulkMarkSerializer(serializers.Serializer):
    records = BulkMarkItemSerializer(many=True, min_length=1)


# ── Report card subject row ───────────────────────────────────────────────────

class ReportCardSubjectSerializer(serializers.Serializer):
    subject_code = serializers.CharField()
    subject_name = serializers.CharField()
    score = serializers.DecimalField(max_digits=5, decimal_places=2)
    grade = serializers.CharField()
    remarks = serializers.CharField()
