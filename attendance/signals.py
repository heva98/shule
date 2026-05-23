from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import AbsenceAlert, AttendanceRecord, AttendanceStatus


@receiver(post_save, sender=AttendanceRecord)
def create_absence_alert(sender, instance, created, **kwargs):
    if not created:
        return
    if instance.status == AttendanceStatus.ABSENT:
        # get_or_create so repeated bulk runs don't duplicate alerts
        AbsenceAlert.objects.get_or_create(
            student=instance.student,
            date=instance.date,
        )
