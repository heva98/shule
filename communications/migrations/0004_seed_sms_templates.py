"""
Seed the default SMS templates (7 keys x 2 languages) so a fresh deployment
can send immediately. Idempotent and reversible — re-running `seed_sms_templates`
later, or editing rows in the admin / UI, is the supported way to change them.
"""

from django.db import migrations


def seed(apps, schema_editor):
    SmsTemplate = apps.get_model("communications", "SmsTemplate")
    from communications.sms_templates import DEFAULT_TEMPLATES

    for (key, language), body in DEFAULT_TEMPLATES.items():
        SmsTemplate.objects.get_or_create(
            key=key, language=language,
            defaults={"body": body, "is_active": True},
        )


def unseed(apps, schema_editor):
    SmsTemplate = apps.get_model("communications", "SmsTemplate")
    from communications.sms_templates import DEFAULT_TEMPLATES

    keys = {k for (k, _lang) in DEFAULT_TEMPLATES}
    SmsTemplate.objects.filter(key__in=keys).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("communications", "0003_sms_models"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
