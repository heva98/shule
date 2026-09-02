from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('students', '0001_initial'),
        ('communications', '0002_demorequest'),
    ]

    operations = [
        migrations.CreateModel(
            name='SmsConfiguration',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('language', models.CharField(choices=[('SW', 'Swahili'), ('EN', 'English')], default='SW', help_text='Which language’s templates this school sends.', max_length=2)),
                ('allow_exam_results', models.BooleanField(default=True)),
                ('allow_fee_reminders', models.BooleanField(default=True)),
                ('allow_announcements', models.BooleanField(default=True)),
                ('auto_payment_thank_you', models.BooleanField(default=False, help_text='Text the primary contact a receipt confirmation when a payment is recorded.')),
                ('auto_term_dates', models.BooleanField(default=False, help_text='Text closing/opening date reminders 5 days and 1 day before each quarter boundary.')),
                ('batch_recipient_cap', models.PositiveIntegerField(default=0)),
                ('max_segments', models.PositiveSmallIntegerField(default=0)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'SMS Configuration',
            },
        ),
        migrations.CreateModel(
            name='SmsTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(choices=[('EXAM_RESULTS', 'Exam results'), ('FEE_REMINDER_DUE', 'Fee reminder — upcoming'), ('FEE_REMINDER_OVERDUE', 'Fee reminder — overdue'), ('PAYMENT_RECEIVED', 'Payment received'), ('ANNOUNCEMENT', 'General announcement'), ('TERM_CLOSING', 'Term closing'), ('TERM_OPENING', 'Term opening')], max_length=32)),
                ('language', models.CharField(choices=[('SW', 'Swahili'), ('EN', 'English')], max_length=2)),
                ('body', models.TextField(help_text='Use {placeholders}. A recipient missing any value is skipped, not sent a blank.')),
                ('is_active', models.BooleanField(default=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['key', 'language'],
                'unique_together': {('key', 'language')},
            },
        ),
        migrations.CreateModel(
            name='SmsBatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('EXAM_RESULTS', 'Exam results'), ('FEE_REMINDER', 'Fee reminder'), ('ANNOUNCEMENT', 'Announcement'), ('TERM_DATES', 'Term dates'), ('PAYMENT_RECEIVED', 'Payment received')], max_length=20)),
                ('status', models.CharField(choices=[('PENDING', 'Pending'), ('QUEUED', 'Queued'), ('RUNNING', 'Running'), ('COMPLETED', 'Completed'), ('FAILED', 'Failed'), ('CANCELLED', 'Cancelled')], default='PENDING', max_length=10)),
                ('template_key', models.CharField(blank=True, max_length=32)),
                ('language', models.CharField(blank=True, choices=[('SW', 'Swahili'), ('EN', 'English')], max_length=2)),
                ('sender_id', models.CharField(blank=True, max_length=20)),
                ('context', models.JSONField(blank=True, default=dict)),
                ('dry_run', models.BooleanField(default=False)),
                ('idempotency_key', models.CharField(blank=True, default='', max_length=120)),
                ('total_recipients', models.PositiveIntegerField(default=0)),
                ('sent_count', models.PositiveIntegerField(default=0)),
                ('failed_count', models.PositiveIntegerField(default=0)),
                ('skipped_count', models.PositiveIntegerField(default=0)),
                ('total_segments', models.PositiveIntegerField(default=0)),
                ('total_cost', models.DecimalField(decimal_places=4, default=0, max_digits=12)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('queued_at', models.DateTimeField(blank=True, null=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='sms_batches', to=settings.AUTH_USER_MODEL)),
                ('template', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='batches', to='communications.smstemplate')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='SmsMessage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('recipient_name', models.CharField(blank=True, max_length=255)),
                ('recipient_phone', models.CharField(blank=True, max_length=20)),
                ('body', models.TextField(blank=True)),
                ('sender_id', models.CharField(blank=True, max_length=20)),
                ('status', models.CharField(choices=[('PENDING', 'Pending'), ('SENT', 'Sent'), ('DELIVERED', 'Delivered'), ('FAILED', 'Failed'), ('SKIPPED', 'Skipped')], default='PENDING', db_index=True, max_length=10)),
                ('skip_reason', models.CharField(blank=True, max_length=255)),
                ('error_detail', models.CharField(blank=True, max_length=500)),
                ('provider_message_id', models.CharField(blank=True, max_length=128)),
                ('provider_status', models.CharField(blank=True, max_length=64)),
                ('provider_response', models.JSONField(blank=True, default=dict)),
                ('segments', models.PositiveSmallIntegerField(default=0)),
                ('cost', models.DecimalField(decimal_places=4, default=0, max_digits=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('batch', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='communications.smsbatch')),
                ('guardian', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sms_messages', to='students.guardian')),
                ('student', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sms_messages', to='students.student')),
                ('sent_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='sms_messages_sent', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['id'],
            },
        ),
        migrations.AddConstraint(
            model_name='smsbatch',
            constraint=models.UniqueConstraint(condition=models.Q(('idempotency_key', ''), _negated=True), fields=('idempotency_key',), name='uniq_sms_batch_idempotency_key'),
        ),
        migrations.AddIndex(
            model_name='smsbatch',
            index=models.Index(fields=['kind', 'status'], name='communicati_kind_315691_idx'),
        ),
        migrations.AddIndex(
            model_name='smsbatch',
            index=models.Index(fields=['created_at'], name='communicati_created_aa4ad9_idx'),
        ),
        migrations.AddConstraint(
            model_name='smsmessage',
            constraint=models.UniqueConstraint(condition=models.Q(('recipient_phone', ''), _negated=True), fields=('batch', 'recipient_phone', 'student'), name='uniq_sms_per_batch_phone_student'),
        ),
        migrations.AddIndex(
            model_name='smsmessage',
            index=models.Index(fields=['batch', 'status'], name='communicati_batch_i_326971_idx'),
        ),
        migrations.AddIndex(
            model_name='smsmessage',
            index=models.Index(fields=['status', 'created_at'], name='communicati_status_193919_idx'),
        ),
    ]
