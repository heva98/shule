"""
Seed / refresh the default SMS templates for both languages.

Idempotent: by default it only creates rows that are missing, leaving any that
staff have edited untouched. `--force` overwrites every row back to the shipped
default text.
"""

from django.core.management.base import BaseCommand

from communications.models import SmsTemplate
from communications.sms_templates import DEFAULT_TEMPLATES


class Command(BaseCommand):
    help = "Create the default SMS templates (per key, per language)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force", action="store_true",
            help="Overwrite existing template bodies with the shipped defaults.",
        )

    def handle(self, *args, **options):
        force = options["force"]
        created = updated = skipped = 0

        for (key, language), body in DEFAULT_TEMPLATES.items():
            obj, was_created = SmsTemplate.objects.get_or_create(
                key=key, language=language,
                defaults={"body": body, "is_active": True},
            )
            if was_created:
                created += 1
            elif force and obj.body != body:
                obj.body = body
                obj.save(update_fields=["body"])
                updated += 1
            else:
                skipped += 1

        self.stdout.write(self.style.SUCCESS(
            f"SMS templates — created {created}, overwritten {updated}, left as-is {skipped}."
        ))
