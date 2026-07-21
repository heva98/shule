from rest_framework import serializers

from .models import BoardingAssignment, Dormitory


class DormitorySerializer(serializers.ModelSerializer):
    warden_name = serializers.CharField(source='warden.user.full_name', read_only=True, default=None)
    occupied_count = serializers.IntegerField(read_only=True)
    available_beds = serializers.IntegerField(read_only=True)

    class Meta:
        model = Dormitory
        fields = [
            'id', 'name', 'gender', 'capacity',
            'warden', 'warden_name', 'location', 'notes',
            'occupied_count', 'available_beds',
        ]


class BoardingAssignmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_gender = serializers.CharField(source='student.gender', read_only=True)
    dormitory_name = serializers.CharField(source='dormitory.name', read_only=True)
    assigned_by_name = serializers.CharField(source='assigned_by.full_name', read_only=True, default=None)

    class Meta:
        model = BoardingAssignment
        fields = [
            'id', 'student', 'student_name', 'student_gender',
            'dormitory', 'dormitory_name', 'academic_year',
            'bed_number', 'assigned_by', 'assigned_by_name',
            'assigned_at', 'is_active', 'vacated_at',
        ]
        read_only_fields = ['id', 'assigned_by', 'assigned_at', 'is_active', 'vacated_at']

    def validate(self, attrs):
        student = attrs.get('student', getattr(self.instance, 'student', None))
        dormitory = attrs.get('dormitory', getattr(self.instance, 'dormitory', None))
        academic_year = attrs.get('academic_year', getattr(self.instance, 'academic_year', None))

        if student and dormitory and student.gender != dormitory.gender:
            raise serializers.ValidationError({
                'dormitory': (
                    f'{dormitory.name} is a {dormitory.get_gender_display()} dormitory — '
                    f'{student.full_name} cannot be assigned here.'
                )
            })

        if dormitory and academic_year:
            occupied = BoardingAssignment.objects.filter(
                dormitory=dormitory, academic_year=academic_year, is_active=True,
            )
            if self.instance:
                occupied = occupied.exclude(pk=self.instance.pk)
            if occupied.count() >= dormitory.capacity:
                raise serializers.ValidationError({
                    'dormitory': f'{dormitory.name} is at full capacity ({dormitory.capacity} beds).'
                })

        return attrs
