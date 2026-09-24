from django.core.management.base import BaseCommand, CommandError

from fees.models import AcademicYear
from students.enrolment import open_year


class Command(BaseCommand):
    help = (
        'Seed enrolment-history rows for every enrolled student who has none '
        'in the given academic year (default: the current year). Existing rows '
        'are left alone, so this is safe to re-run.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--year', type=int, help='Academic year, e.g. 2026 (default: current)')

    def handle(self, *args, **options):
        if options['year']:
            year = AcademicYear.objects.filter(year=options['year']).first()
            if year is None:
                raise CommandError(f'Academic year {options["year"]} does not exist.')
        else:
            year = AcademicYear.objects.filter(is_current=True).first()
            if year is None:
                raise CommandError('No current academic year is set.')

        created = open_year(year)
        self.stdout.write(self.style.SUCCESS(f'{year.year}: created {created} enrolment row(s).'))
