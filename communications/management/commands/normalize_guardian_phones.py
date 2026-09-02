"""
Backfill: normalise existing Guardian phone / whatsapp_phone values to
Tanzanian E.164 (+255XXXXXXXXX).

Dry-run by default — prints what would change and lists every value that could
not be parsed. Pass --commit to write. Unparseable values are reported and left
exactly as they are; the command never crashes on a bad row.
"""

from django.core.management.base import BaseCommand

from shule.phone import is_valid_tz_phone, normalize_tz_phone
from students.models import Guardian


class Command(BaseCommand):
    help = "Normalise Guardian phone numbers to +255 E.164. Dry-run unless --commit."

    def add_arguments(self, parser):
        parser.add_argument("--commit", action="store_true", help="Persist changes.")

    def handle(self, *args, **options):
        commit = options["commit"]
        changed = already_ok = unparseable = 0
        bad_rows = []

        qs = Guardian.objects.select_related("student").iterator()
        to_save = []

        for g in qs:
            row_changed = False
            for field in ("phone", "whatsapp_phone"):
                current = getattr(g, field) or ""
                if not current:
                    continue
                if is_valid_tz_phone(current):
                    already_ok += 1
                    continue
                normalised = normalize_tz_phone(current)
                if normalised:
                    setattr(g, field, normalised)
                    row_changed = True
                    changed += 1
                    self.stdout.write(
                        f"  {g.student.student_id} {g.full_name}: {field} {current!r} -> {normalised}"
                    )
                else:
                    unparseable += 1
                    bad_rows.append((g.student.student_id, g.full_name, field, current))

            if row_changed:
                to_save.append(g)

        if commit and to_save:
            # Model.save() re-runs normalisation; update only the phone fields.
            for g in to_save:
                Guardian.objects.filter(pk=g.pk).update(
                    phone=g.phone, whatsapp_phone=g.whatsapp_phone
                )

        if bad_rows:
            self.stdout.write(self.style.WARNING("\nUnparseable numbers (left unchanged):"))
            for student_id, name, field, value in bad_rows:
                self.stdout.write(f"  {student_id}  {name}  {field}={value!r}")

        verb = "updated" if commit else "would update"
        self.stdout.write(self.style.SUCCESS(
            f"\n{verb} {changed} value(s); {already_ok} already E.164; "
            f"{unparseable} unparseable."
        ))
        if not commit and changed:
            self.stdout.write("Re-run with --commit to apply.")
