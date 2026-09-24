"""
Stream helpers shared across apps.

`students.Stream` is the managed list of stream names. Other tables keep a
plain `StreamField` text column rather than a foreign key, so this module is
where the two are tied together: the serializer field that only accepts
names from the list, and the lookup of which tables still use a name.
"""
from django.apps import apps
from rest_framework import serializers

from .fields import normalize_stream

# Every (model label, field name) that stores a stream name.
STREAM_COLUMNS = [
    ('students.Student', 'stream'),
    ('students.Enrolment', 'stream'),
    ('exams.Exam', 'stream'),
    ('timetable.TimetableEntry', 'stream'),
    ('homepackages.HomePackage', 'stream'),
    ('staff.ClassTeacherAssignment', 'stream'),
    ('staff.StaffProfile', 'class_teacher_of_stream'),
    ('communications.Message', 'target_stream'),
]


def stream_in_use(name):
    """True if any record still refers to the stream `name`."""
    name = normalize_stream(name)
    return any(
        apps.get_model(label).objects.filter(**{field: name}).exists()
        for label, field in STREAM_COLUMNS
    )


class StreamSerializerField(serializers.CharField):
    """Accepts a stream name from the managed list, returned in uppercase."""

    def __init__(self, **kwargs):
        kwargs.setdefault('max_length', 10)
        kwargs.setdefault('required', False)
        kwargs.setdefault('allow_blank', True)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = normalize_stream(super().to_internal_value(data))
        if value:
            Stream = apps.get_model('students', 'Stream')
            if not Stream.objects.filter(name=value).exists():
                raise serializers.ValidationError(
                    f'"{value}" is not a known stream. Ask an administrator to add it first.'
                )
        return value
