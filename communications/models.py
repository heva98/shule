from django.conf import settings
from django.db import models


class MessageType(models.TextChoices):
    SMS = 'SMS', 'SMS'
    EMAIL = 'EMAIL', 'Email'


class Audience(models.TextChoices):
    SCHOOL = 'SCHOOL', 'Entire School'
    LEVEL = 'LEVEL', 'By Level'
    CLASS = 'CLASS', 'By Class (Level + Stream)'
    INDIVIDUAL = 'INDIVIDUAL', 'Individual'


class DeliveryStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    SENT = 'SENT', 'Sent'
    FAILED = 'FAILED', 'Failed'


class Message(models.Model):
    subject = models.CharField(max_length=255, blank=True)
    body = models.TextField()
    message_type = models.CharField(max_length=10, choices=MessageType.choices)
    audience = models.CharField(max_length=15, choices=Audience.choices)

    # Scoping fields — used when audience != SCHOOL
    target_level = models.CharField(max_length=10, blank=True)
    target_stream = models.CharField(max_length=10, blank=True)
    # For INDIVIDUAL audience, store the recipient student/guardian pk
    target_student = models.ForeignKey(
        'students.Student',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='messages_received',
    )

    # null=True allows system-generated messages (absence alerts, reminders)
    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='messages_sent',
        null=True,
        blank=True,
    )
    sent_at = models.DateTimeField(auto_now_add=True)
    total_recipients = models.IntegerField(default=0)
    delivered_count = models.IntegerField(default=0)

    class Meta:
        ordering = ['-sent_at']

    def __str__(self):
        return f'[{self.message_type}] {self.subject or self.body[:40]} — {self.sent_at:%Y-%m-%d %H:%M}'

    @property
    def delivery_rate(self):
        if self.total_recipients == 0:
            return 0
        return round(self.delivered_count / self.total_recipients * 100, 1)


class MessageLog(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='logs')
    recipient_phone = models.CharField(max_length=20, blank=True)
    recipient_email = models.EmailField(blank=True)
    recipient_name = models.CharField(max_length=255)
    status = models.CharField(
        max_length=10, choices=DeliveryStatus.choices, default=DeliveryStatus.PENDING
    )
    provider_response = models.JSONField(default=dict, blank=True)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-sent_at']

    def __str__(self):
        return f'{self.recipient_name} | {self.status} | {self.sent_at:%Y-%m-%d %H:%M}'


class DemoRequest(models.Model):
    """A prospective user asking to be shown the system, submitted from the public landing page."""
    full_name = models.CharField(max_length=255)
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True)
    school_name = models.CharField(max_length=255, blank=True)
    message = models.TextField(blank=True)
    contacted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.full_name} ({self.email}) — {self.created_at:%Y-%m-%d %H:%M}'


# ── SMS (Notify Africa) ──────────────────────────────────────────────────────
# A separate model set from Message/MessageLog above (the email channel). SMS
# needs per-recipient provider ids, cost, segment counts, a normalised phone and
# an auditable batch rollup that the older models don't carry.


class SmsLanguage(models.TextChoices):
    SW = 'SW', 'Swahili'
    EN = 'EN', 'English'


class SmsConfiguration(models.Model):
    """
    Per-school SMS behaviour. Singleton — always row pk=1, fetched via
    `SmsConfiguration.load()`. Mirrors accounts.SchoolSettings' pattern.
    """
    language = models.CharField(
        max_length=2, choices=SmsLanguage.choices, default=SmsLanguage.SW,
        help_text='Which language’s templates this school sends.',
    )

    # Master switches for the three staff-initiated use cases. Turning one off
    # hides its composer option and rejects its endpoint.
    allow_exam_results = models.BooleanField(default=True)
    allow_fee_reminders = models.BooleanField(default=True)
    allow_announcements = models.BooleanField(default=True)

    # Automatic sends — opt-in, off by default.
    auto_payment_thank_you = models.BooleanField(
        default=False,
        help_text='Text the primary contact a receipt confirmation when a payment is recorded.',
    )
    auto_term_dates = models.BooleanField(
        default=False,
        help_text='Text closing/opening date reminders 5 days and 1 day before each quarter boundary.',
    )

    # Optional per-school tightening of the deployment guard rails. 0 = inherit
    # the settings.py value; a positive number must be <= it.
    batch_recipient_cap = models.PositiveIntegerField(default=0)
    max_segments = models.PositiveSmallIntegerField(default=0)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'SMS Configuration'

    def __str__(self):
        return f'SMS configuration ({self.get_language_display()})'

    @classmethod
    def load(cls) -> 'SmsConfiguration':
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    @property
    def effective_recipient_cap(self) -> int:
        from django.conf import settings
        ceiling = settings.SMS_BATCH_RECIPIENT_CAP
        if self.batch_recipient_cap and self.batch_recipient_cap <= ceiling:
            return self.batch_recipient_cap
        return ceiling

    @property
    def effective_max_segments(self) -> int:
        from django.conf import settings
        ceiling = settings.SMS_MAX_SEGMENTS
        if self.max_segments and self.max_segments <= ceiling:
            return self.max_segments
        return ceiling


class SmsTemplateKey(models.TextChoices):
    EXAM_RESULTS = 'EXAM_RESULTS', 'Exam results'
    FEE_REMINDER_DUE = 'FEE_REMINDER_DUE', 'Fee reminder — upcoming'
    FEE_REMINDER_OVERDUE = 'FEE_REMINDER_OVERDUE', 'Fee reminder — overdue'
    PAYMENT_RECEIVED = 'PAYMENT_RECEIVED', 'Payment received'
    ANNOUNCEMENT = 'ANNOUNCEMENT', 'General announcement'
    TERM_CLOSING = 'TERM_CLOSING', 'Term closing'
    TERM_OPENING = 'TERM_OPENING', 'Term opening'


class SmsTemplate(models.Model):
    """
    An editable message body with {placeholder} slots. One row per
    (key, language); the active row for the school's configured language is the
    one that gets sent. Rendering that hits a missing placeholder value skips
    the recipient and records why — a literal "{placeholder}" or "None" is
    never sent.
    """
    key = models.CharField(max_length=32, choices=SmsTemplateKey.choices)
    language = models.CharField(max_length=2, choices=SmsLanguage.choices)
    body = models.TextField(
        help_text='Use {placeholders}. A recipient missing any value is skipped, not sent a blank.',
    )
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+',
    )

    class Meta:
        unique_together = ('key', 'language')
        ordering = ['key', 'language']

    def __str__(self):
        return f'{self.get_key_display()} [{self.language}]'


class SmsBatch(models.Model):
    """One bulk (or single) send as a single auditable object with a status rollup."""

    class Kind(models.TextChoices):
        EXAM_RESULTS = 'EXAM_RESULTS', 'Exam results'
        FEE_REMINDER = 'FEE_REMINDER', 'Fee reminder'
        ANNOUNCEMENT = 'ANNOUNCEMENT', 'Announcement'
        TERM_DATES = 'TERM_DATES', 'Term dates'
        PAYMENT_RECEIVED = 'PAYMENT_RECEIVED', 'Payment received'

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'      # rows built, not yet queued
        QUEUED = 'QUEUED', 'Queued'
        RUNNING = 'RUNNING', 'Running'
        COMPLETED = 'COMPLETED', 'Completed'
        FAILED = 'FAILED', 'Failed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    kind = models.CharField(max_length=20, choices=Kind.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    template = models.ForeignKey(
        SmsTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name='batches',
    )
    template_key = models.CharField(max_length=32, blank=True)
    language = models.CharField(max_length=2, choices=SmsLanguage.choices, blank=True)
    # Notify Africa's sender-id reference. Historically a short integer; newer
    # accounts get a UUID, so this is sized for a 36-char UUID plus headroom.
    sender_id = models.CharField(max_length=64, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='sms_batches',
    )
    # Describes the resolved audience for audit: exam id, level/stream, filter,
    # closing/opening dates, source payment id, etc.
    context = models.JSONField(default=dict, blank=True)
    dry_run = models.BooleanField(default=False)
    # De-dupe key for retried automatic sends (payment / term-date jobs). A
    # blank value never collides; a set value is unique.
    idempotency_key = models.CharField(max_length=120, blank=True, default='')

    total_recipients = models.PositiveIntegerField(default=0)
    sent_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)
    total_segments = models.PositiveIntegerField(default=0)
    total_cost = models.DecimalField(max_digits=12, decimal_places=4, default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    queued_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['idempotency_key'],
                condition=~models.Q(idempotency_key=''),
                name='uniq_sms_batch_idempotency_key',
            ),
        ]
        indexes = [
            models.Index(fields=['kind', 'status']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f'{self.get_kind_display()} — {self.created_at:%Y-%m-%d %H:%M} ({self.status})'


class SmsMessage(models.Model):
    """One recipient of one batch."""

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        SENT = 'SENT', 'Sent'
        DELIVERED = 'DELIVERED', 'Delivered'
        FAILED = 'FAILED', 'Failed'
        SKIPPED = 'SKIPPED', 'Skipped'

    batch = models.ForeignKey(SmsBatch, on_delete=models.CASCADE, related_name='messages')
    student = models.ForeignKey(
        'students.Student', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='sms_messages',
    )
    guardian = models.ForeignKey(
        'students.Guardian', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='sms_messages',
    )
    recipient_name = models.CharField(max_length=255, blank=True)
    recipient_phone = models.CharField(max_length=20, blank=True)  # normalised +255…, blank if skipped before normalisation
    body = models.TextField(blank=True)
    sender_id = models.CharField(max_length=64, blank=True)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    skip_reason = models.CharField(max_length=255, blank=True)
    error_detail = models.CharField(max_length=500, blank=True)

    provider_message_id = models.CharField(max_length=128, blank=True)
    provider_status = models.CharField(max_length=64, blank=True)
    provider_response = models.JSONField(default=dict, blank=True)

    segments = models.PositiveSmallIntegerField(default=0)
    cost = models.DecimalField(max_digits=10, decimal_places=4, default=0)

    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='sms_messages_sent',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['id']
        constraints = [
            # A rebuilt/retried batch must not create a second row for the same
            # (phone, pupil). Per-pupil is deliberate: a contact with two
            # children in the school gets one SMS per child.
            models.UniqueConstraint(
                fields=['batch', 'recipient_phone', 'student'],
                condition=~models.Q(recipient_phone=''),
                name='uniq_sms_per_batch_phone_student',
            ),
        ]
        indexes = [
            models.Index(fields=['batch', 'status']),
            models.Index(fields=['status', 'created_at']),
        ]

    def __str__(self):
        return f'{self.recipient_phone or self.recipient_name} — {self.status}'
