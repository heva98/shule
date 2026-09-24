"""
Start the enrolment history from today: seed the current academic year with
every enrolled student's class as it stands. Earlier years can't be
reconstructed from Student itself, so they stay empty.
"""
from django.db import migrations
from django.utils import timezone


def seed(apps, schema_editor):
    AcademicYear = apps.get_model('fees', 'AcademicYear')
    Student = apps.get_model('students', 'Student')
    Enrolment = apps.get_model('students', 'Enrolment')

    year = AcademicYear.objects.filter(is_current=True).first()
    if year is None:
        return
    enrolled_on = year.q1_start or timezone.localdate()
    Enrolment.objects.bulk_create(
        [
            Enrolment(
                student_id=s.pk,
                academic_year_id=year.pk,
                level=s.level,
                stream=s.stream,
                status=s.status,
                enrolled_on=enrolled_on,
            )
            for s in Student.objects.filter(status__in=['ACTIVE', 'SUSPENDED'])
        ],
        ignore_conflicts=True,
        batch_size=500,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0007_enrolment'),
    ]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
