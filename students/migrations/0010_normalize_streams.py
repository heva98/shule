"""
Uppercase every stored stream name and seed the managed `Stream` list with
the names already in use, so existing records stay valid under the new rule.

A row whose uppercased value would collide with another row on a unique
constraint (e.g. class-teacher assignments for both "FORM1 a" and "FORM1 A"
in the same year) is left unchanged and reported, rather than deleted.
"""
from django.db import IntegrityError, migrations, transaction

# Mirrors students.streams.STREAM_COLUMNS as of this migration.
STREAM_COLUMNS = [
    ('students', 'Student', 'stream'),
    ('students', 'Enrolment', 'stream'),
    ('exams', 'Exam', 'stream'),
    ('timetable', 'TimetableEntry', 'stream'),
    ('homepackages', 'HomePackage', 'stream'),
    ('staff', 'ClassTeacherAssignment', 'stream'),
    ('staff', 'StaffProfile', 'class_teacher_of_stream'),
    ('communications', 'Message', 'target_stream'),
]


def normalize_streams(apps, schema_editor):
    names = set()
    for app_label, model_name, field in STREAM_COLUMNS:
        Model = apps.get_model(app_label, model_name)
        for pk, value in Model.objects.exclude(**{field: ''}).values_list('pk', field).iterator():
            new = value.strip().upper()
            if new != value:
                try:
                    with transaction.atomic():
                        Model.objects.filter(pk=pk).update(**{field: new})
                except IntegrityError:
                    print(f'\n  Stream not normalised: {model_name} pk={pk} {value!r} '
                          f'clashes with an existing {new!r} row.')
                    continue
            if new:
                names.add(new)

    Stream = apps.get_model('students', 'Stream')
    existing = set(Stream.objects.values_list('name', flat=True))
    Stream.objects.bulk_create(Stream(name=n) for n in sorted(names - existing))


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0009_stream'),
        ('communications', '0008_alter_message_target_stream'),
        ('exams', '0007_alter_exam_stream'),
        ('homepackages', '0003_alter_homepackage_stream'),
        ('staff', '0005_alter_classteacherassignment_stream_and_more'),
        ('timetable', '0004_alter_timetableentry_stream'),
    ]

    operations = [
        migrations.RunPython(normalize_streams, migrations.RunPython.noop),
    ]
