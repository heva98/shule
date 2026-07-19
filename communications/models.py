from django.conf import settings
from django.db import models


class MessageType(models.TextChoices):
    SMS = 'SMS', 'SMS'
    WHATSAPP = 'WHATSAPP', 'WhatsApp'
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
    # For WhatsApp type — the wa.me URL generated
    whatsapp_url = models.URLField(max_length=2000, blank=True)
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
