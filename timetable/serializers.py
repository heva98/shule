from rest_framework import serializers

from .models import Period, TimetableEntry


class PeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = Period
        fields = ['id', 'name', 'start_time', 'end_time', 'order', 'is_break']


class TimetableEntrySerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.name', read_only=True, default=None)
    subject_code = serializers.CharField(source='subject.code', read_only=True, default=None)
    teacher_name = serializers.CharField(source='teacher.user.full_name', read_only=True, default=None)
    period_name = serializers.CharField(source='period.name', read_only=True)
    period_order = serializers.IntegerField(source='period.order', read_only=True)
    day_of_week_display = serializers.CharField(source='get_day_of_week_display', read_only=True)

    class Meta:
        model = TimetableEntry
        fields = [
            'id', 'academic_year', 'level', 'stream', 'day_of_week', 'day_of_week_display',
            'period', 'period_name', 'period_order',
            'subject', 'subject_name', 'subject_code',
            'teacher', 'teacher_name', 'room',
        ]

    def validate(self, attrs):
        # Merge with existing instance values on partial update so we validate the full picture.
        academic_year = attrs.get('academic_year', getattr(self.instance, 'academic_year', None))
        day_of_week = attrs.get('day_of_week', getattr(self.instance, 'day_of_week', None))
        period = attrs.get('period', getattr(self.instance, 'period', None))
        teacher = attrs.get('teacher', getattr(self.instance, 'teacher', None))

        if teacher and academic_year and day_of_week and period:
            clash = TimetableEntry.objects.filter(
                academic_year=academic_year,
                day_of_week=day_of_week,
                period=period,
                teacher=teacher,
            )
            if self.instance:
                clash = clash.exclude(pk=self.instance.pk)
            existing = clash.select_related('period').first()
            if existing:
                raise serializers.ValidationError({
                    'teacher': (
                        f'{teacher.user.full_name} is already scheduled for '
                        f'{existing.level}{existing.stream} at this time.'
                    )
                })

        return attrs
