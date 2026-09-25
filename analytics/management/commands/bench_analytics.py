"""
Time the analytics query shapes through the real code path (`run_query`,
`run_drilldown`), and print a Markdown table for
docs/analytics/QUERY_PERF.md.

    DB_NAME=shule_bench python manage.py bench_analytics
    DB_NAME=shule_bench python manage.py bench_analytics --explain G

Read-only: it runs queries and writes nothing. Each shape runs once to warm
the cache, then `--runs` times; the table gives the median and the slowest
run, plus the number of SQL statements. `--explain` prints
`EXPLAIN (ANALYZE, BUFFERS)` for the slowest statement of the named shapes.
"""
import logging
import statistics
import time

from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.http import QueryDict
from django.test.utils import CaptureQueriesContext

from accounts.models import Role, User
from fees.models import AcademicYear
from staff.models import ClassTeacherAssignment
from students.models import Level

from analytics.drilldown import run_drilldown
from analytics.query import run_query

CLASSES = ';'.join(v for v, _ in Level.choices if v.startswith(('STD', 'FORM')))


def _shapes(years):
    """(id, description, endpoint, params, role) for every shape measured."""
    y0, y1, y2 = years[-3:]
    all_years = f'{y0};{y1};{y2}'
    marks = 'dx:exam.mean_score;exam.marks_count;exam.candidates'
    return [
        ('A', 'marks: mean, count, candidates x 2 terms x 2 classes', 'query',
         [f'dimension={marks}', f'dimension=pe:{y2}T1;{y2}T2', 'dimension=ou:FORM1;FORM2'], None),
        ('B', 'A + subject and gender filters', 'query',
         [f'dimension={marks}', f'dimension=pe:{y2}T1;{y2}T2', 'dimension=ou:FORM1;FORM2',
          'filter=subject:O01;O02', 'filter=gender:F'], None),
        ('C', 'marks: mean + median x 3 years x every class, masked', 'query',
         ['dimension=dx:exam.mean_score;exam.median_score', f'dimension=pe:{all_years}',
          f'dimension=ou:{CLASSES}'], Role.ACADEMIC_TEACHER),
        ('D', 'marks: mean x 3 streams (stream fallback subquery)', 'query',
         ['dimension=dx:exam.mean_score', f'dimension=pe:{y2}', 'dimension=ou:FORM1/A;FORM1/B;FORM2/A'], None),
        ('E', 'marks: mean x every subject, one term, O-level', 'query',
         ['dimension=dx:exam.mean_score', 'dimension=subject:', f'filter=pe:{y2}T1', 'filter=ou:OLEVEL'], None),
        ('F', 'enrolment x class x gender', 'query',
         ['dimension=dx:enrol.enrolled', 'dimension=ou:' + CLASSES, 'dimension=gender:', f'filter=pe:{y2}'], None),
        ('G', 'fees: billed, required, outstanding, collected x 3 years x every class', 'query',
         ['dimension=dx:fees.billed;fees.required;fees.outstanding;fees.collected',
          f'dimension=pe:{all_years}', f'dimension=ou:{CLASSES}'], None),
        ('H', 'fees: collection rate x 4 quarters x every class', 'query',
         ['dimension=dx:fees.collection_rate', f'dimension=pe:{y2}Q1;{y2}Q2;{y2}Q3;{y2}Q4',
          f'dimension=ou:{CLASSES}'], None),
        ('I', 'fees: students with arrears x every class', 'query',
         ['dimension=dx:fees.defaulters', f'dimension=ou:{CLASSES}', f'filter=pe:{y2}'], None),
        ('J', 'fees: cash received x last 12 months x payment method', 'query',
         ['dimension=dx:fees.cash_in', 'dimension=pe:LAST_12_MONTHS', 'dimension=payment_method:'], None),
        ('K', 'fees: collected x streams of two classes', 'query',
         ['dimension=dx:fees.collected', f'dimension=pe:{y2}',
          'dimension=ou:FORM1/A;FORM1/B;FORM2/A;FORM2/B'], None),
        ('L', 'SMS: messages, delivery rate, cost x 3 years x every class', 'query',
         ['dimension=dx:sms.messages;sms.delivered_rate;sms.cost', f'dimension=pe:{all_years}',
          f'dimension=ou:{CLASSES}'], None),
        ('M', 'class teacher: mean x subject, own class, whole year', 'query',
         ['dimension=dx:exam.mean_score', 'dimension=subject:', f'filter=pe:{y2}'], Role.CLASS_TEACHER),
        ('N', 'drill-down: mean score, whole school, one year (every pupil)', 'drilldown',
         ['dimension=dx:exam.mean_score', f'filter=pe:{y2}'], None),
        ('O', 'drill-down: outstanding fees, FORM1, one year', 'drilldown',
         ['dimension=dx:fees.outstanding', f'filter=pe:{y2}', 'filter=ou:FORM1'], None),
        ('P', 'drill-down: class teacher, marks count, own class', 'drilldown',
         ['dimension=dx:exam.marks_count', f'filter=pe:{y2}'], Role.CLASS_TEACHER),
    ]


class Command(BaseCommand):
    help = 'Time the analytics query shapes and print a Markdown table.'

    def add_arguments(self, parser):
        parser.add_argument('--runs', type=int, default=5)
        parser.add_argument('--only', nargs='*', default=None, help='shape ids to run')
        parser.add_argument('--explain', nargs='*', default=(), help='shape ids to EXPLAIN')

    def handle(self, *args, runs, only, explain, **options):
        # Every run would log its time; the table reports them instead.
        logging.getLogger('analytics.query').setLevel(logging.ERROR)
        years = list(AcademicYear.objects.order_by('year').values_list('year', flat=True))
        if len(years) < 3:
            raise CommandError('Needs three academic years; run seed_analytics_bench first.')
        users = {None: User(role=Role.OWNER)}
        assignment = ClassTeacherAssignment.objects.select_related('teacher__user').first()
        if assignment:
            users[Role.CLASS_TEACHER] = assignment.teacher.user
        users[Role.ACADEMIC_TEACHER] = User(role=Role.ACADEMIC_TEACHER)

        self.stdout.write('| Shape | Query | SQL | Result rows | Median | Slowest |')
        self.stdout.write('|---|---|---|---|---|---|')
        for shape_id, desc, endpoint, params, role in _shapes(years):
            if only and shape_id not in only:
                continue
            if role not in users:
                self.stdout.write(f'| {shape_id} | {desc} | skipped: no class-teacher assignment | | | |')
                continue
            qd = QueryDict('&'.join(params))
            call = run_query if endpoint == 'query' else run_drilldown
            call(qd, users[role])  # warm-up
            times, captured = [], None
            for _ in range(runs):
                with CaptureQueriesContext(connection) as ctx:
                    started = time.perf_counter()
                    result = call(qd, users[role])
                    times.append((time.perf_counter() - started) * 1000)
                captured = ctx.captured_queries
            size = result['height'] if endpoint == 'query' else result['total']
            self.stdout.write(
                f'| {shape_id} | {desc} | {len(captured)} | {size:,} | '
                f'{statistics.median(times):,.0f} ms | {max(times):,.0f} ms |'
            )
            if shape_id in explain:
                self._explain(shape_id, captured)

    def _explain(self, shape_id, captured):
        slowest = max(captured, key=lambda q: float(q['time']))
        with connection.cursor() as cursor:
            cursor.execute('EXPLAIN (ANALYZE, BUFFERS) ' + slowest['sql'])
            plan = '\n'.join(row[0] for row in cursor.fetchall())
        self.stderr.write(f'\n── {shape_id}: slowest statement ──\n{slowest["sql"]}\n\n{plan}\n')
