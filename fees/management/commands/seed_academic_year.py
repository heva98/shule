import datetime

from django.core.management.base import BaseCommand, CommandError

from fees.models import AcademicYear


class Command(BaseCommand):
    help = 'Create an academic year. Defaults to the current calendar year.'

    def add_arguments(self, parser):
        parser.add_argument(
            'year',
            type=int,
            nargs='?',
            default=datetime.date.today().year,
            help='The calendar year to create (default: current year)',
        )
        parser.add_argument(
            '--current',
            action='store_true',
            default=True,
            help='Mark this year as the current academic year (default: true)',
        )

    def handle(self, *args, **options):
        year = options['year']
        mark_current = options['current']

        if AcademicYear.objects.filter(year=year).exists():
            self.stdout.write(self.style.WARNING(f'Academic year {year} already exists.'))
            return

        if mark_current:
            AcademicYear.objects.filter(is_current=True).update(is_current=False)

        AcademicYear.objects.create(year=year, is_current=mark_current)
        self.stdout.write(
            self.style.SUCCESS(
                f'Created academic year {year}'
                + (' (marked as current)' if mark_current else '')
            )
        )
