from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0005_alter_student_level'),
    ]

    operations = [
        migrations.AddField(
            model_name='guardian',
            name='sms_opt_out',
            field=models.BooleanField(default=False),
        ),
    ]
