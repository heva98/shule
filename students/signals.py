from django.db.models.signals import post_save
from django.dispatch import receiver

from fees.models import AcademicYear

from .enrolment import open_year, record_enrolment
from .models import Student


@receiver(post_save, sender=Student)
def track_enrolment(sender, instance, raw=False, **kwargs):
    if raw:
        return
    record_enrolment(instance)


@receiver(post_save, sender=AcademicYear)
def seed_enrolments_for_current_year(sender, instance, raw=False, **kwargs):
    if raw or not instance.is_current:
        return
    open_year(instance)
