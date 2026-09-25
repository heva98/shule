"""
Seed a scratch database with a realistic school history for measuring the
analytics queries (ANALYTICS_PLAN.md P11, docs/analytics/QUERY_PERF.md).

    DB_NAME=shule_bench python manage.py migrate
    DB_NAME=shule_bench python manage.py seed_analytics_bench
    DB_NAME=shule_bench python manage.py bench_analytics

It writes straight to the tables with `bulk_create`: no signals, no fee
sync, no receipts. The rows are shaped like real ones, but the stored
running totals (`amount_allocated`, `amount_paid`) are not maintained, and
analytics never reads them. It refuses to run unless the database name
contains "bench", because it is never run against a school's data (D20).
"""
import datetime
import random
from contextlib import contextmanager
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import Role, User
from communications.models import SmsBatch, SmsMessage
from exams.models import Exam, ExamType, MarkEntry, Subject
from fees.models import (
    AcademicYear, FeeAdjustment, FeeCategory, Invoice, InvoiceKind, InvoiceLine, InvoiceStatus,
    LineStatus, Payment, PaymentAllocation, PaymentMethod, PaymentStatus,
)
from staff.models import ClassTeacherAssignment
from students.models import Enrolment, Level, Stream, Student, StudentStatus

LEVELS = [Level.STD1, Level.STD2, Level.STD3, Level.STD4, Level.STD5, Level.STD6, Level.STD7,
          Level.FORM1, Level.FORM2, Level.FORM3, Level.FORM4]
GROUP_OF = {**{lv: 'PRIMARY' for lv in LEVELS[:7]}, **{lv: 'OLEVEL' for lv in LEVELS[7:]}}
STREAMS = ['A', 'B']
# (term, quarter, exam type) for the six exams each class sits a year.
EXAMS = [
    ('TERM1', 'Q1', ExamType.CA1), ('TERM1', 'Q2', ExamType.MIDTERM),
    ('TERM1', 'Q2', ExamType.TERMINAL), ('TERM2', 'Q3', ExamType.CA2),
    ('TERM2', 'Q4', ExamType.MIDTERM), ('TERM2', 'Q4', ExamType.TERMINAL),
]
QUARTERS = [('TERM1', 'Q1'), ('TERM1', 'Q2'), ('TERM2', 'Q3'), ('TERM2', 'Q4')]
BATCH = 5_000


def _grade(score):
    return 'A' if score >= 81 else 'B' if score >= 61 else 'C' if score >= 41 else 'D' if score >= 21 else 'F'


def _aware(date, hour=10):
    return timezone.make_aware(datetime.datetime.combine(date, datetime.time(hour)))


@contextmanager
def _explicit_timestamps(*models):
    """Let bulk_create store the `created_at` values it is given: the history
    is spread over three years, not stamped with today."""
    fields = [f for m in models for f in m._meta.fields if getattr(f, 'auto_now_add', False)]
    for f in fields:
        f.auto_now_add = False
    try:
        yield
    finally:
        for f in fields:
            f.auto_now_add = True


class Command(BaseCommand):
    help = 'Seed a scratch "bench" database with a realistic school history for analytics timing.'

    def add_arguments(self, parser):
        parser.add_argument('--pupils', type=int, default=1200)
        parser.add_argument('--years', type=int, default=3)
        parser.add_argument('--subjects', type=int, default=14, help='per level group')
        parser.add_argument('--seed', type=int, default=20260925)

    def handle(self, *args, pupils, years, subjects, seed, **options):
        name = settings.DATABASES['default']['NAME']
        if 'bench' not in name:
            raise CommandError(f"Refusing to seed '{name}': the database name must contain 'bench'.")
        if Student.objects.exists():
            raise CommandError(f"'{name}' already has pupils. Seed an empty, migrated database.")
        self.rng = random.Random(seed)
        with transaction.atomic(), _explicit_timestamps(InvoiceLine, SmsBatch, SmsMessage):
            self._seed(pupils, years, subjects)

    def _log(self, what, n):
        self.stdout.write(f'  {what}: {n:,}')

    def _seed(self, n_pupils, n_years, n_subjects):
        rng = self.rng
        today = timezone.localdate()
        first_year = today.year - n_years + 1
        self.user = User.objects.create_user(
            email='bench@bench.local', password=None, role=Role.OWNER, full_name='Bench User',
        )
        for s in STREAMS:
            Stream.objects.get_or_create(name=s)

        years = []
        for y in range(first_year, today.year + 1):
            years.append(AcademicYear.objects.create(
                year=y, is_current=(y == today.year),
                q1_start=datetime.date(y, 1, 8), q1_end=datetime.date(y, 3, 31),
                q2_start=datetime.date(y, 4, 15), q2_end=datetime.date(y, 6, 30),
                q3_start=datetime.date(y, 7, 15), q3_end=datetime.date(y, 9, 30),
                q4_start=datetime.date(y, 10, 8), q4_end=datetime.date(y, 12, 5),
            ))
        self._log('academic years', len(years))

        subjects = {
            group: [Subject.objects.create(
                name=f'{group.title()} subject {i + 1}', code=f'{group[0]}{i + 1:02d}',
                level_group=group, is_compulsory=i < 5,
            ) for i in range(n_subjects)]
            for group in ('PRIMARY', 'OLEVEL')
        }
        self._log('subjects', n_subjects * 2)

        # Each pupil joins at a level in the first year and moves up one a
        # year; a pupil past FORM4 has left, one below STD1 hasn't joined.
        start = [rng.randrange(-(n_years - 1), len(LEVELS)) for _ in range(n_pupils)]
        students = Student.objects.bulk_create([
            Student(
                first_name=f'Pupil{i + 1}', last_name=rng.choice(['Juma', 'Mushi', 'Said', 'Mollel', 'Ally']),
                gender=rng.choice('MF'), date_of_birth=datetime.date(2008 + rng.randrange(10), 1, 1),
                student_id=f'BENCH-{i + 1:05d}', level=LEVELS[min(max(s + n_years - 1, 0), len(LEVELS) - 1)],
                stream=rng.choice(STREAMS), has_special_needs=rng.random() < 0.04,
                admission_date=datetime.date(first_year + max(-s, 0), 1, 8),
                status=StudentStatus.ACTIVE if s + n_years - 1 < len(LEVELS) else StudentStatus.GRADUATED,
            )
            for i, s in enumerate(start)
        ], batch_size=BATCH)
        self._log('pupils', len(students))

        # (student, year) → level, for the years the pupil was at school.
        placed = {}
        for student, s in zip(students, start):
            for yi, ay in enumerate(years):
                if 0 <= s + yi < len(LEVELS):
                    placed[(student, ay)] = LEVELS[s + yi]
        Enrolment.objects.bulk_create([
            Enrolment(student=st, academic_year=ay, level=lv, stream=st.stream,
                      status=StudentStatus.ACTIVE, enrolled_on=datetime.date(ay.year, 1, 8))
            for (st, ay), lv in placed.items()
        ], batch_size=BATCH)
        self._log('enrolments', len(placed))

        self._marks(years, subjects, placed)
        self._fees(years, placed)
        self._sms(years, students, placed)
        self._class_teacher(years[-1])

    def _marks(self, years, subjects, placed):
        rng = self.rng
        exams = {}
        for ay in years:
            for level in LEVELS:
                for term, quarter, etype in EXAMS:
                    month = int(quarter[1]) * 3 - 1
                    exams[(ay, level, quarter, etype)] = Exam(
                        name=f'{etype} {quarter} {level} {ay.year}', academic_year=ay, term=term,
                        quarter=quarter, level=level, exam_type=etype,
                        start_date=datetime.date(ay.year, month, 1), end_date=datetime.date(ay.year, month, 5),
                        created_by=self.user,
                    )
        Exam.objects.bulk_create(exams.values(), batch_size=BATCH)
        self._log('exams', len(exams))

        # A pupil has an ability; each mark scatters around it.
        ability = {}
        rows = 0
        batch = []
        for (student, ay), level in placed.items():
            base = ability.setdefault(student.pk, rng.gauss(58, 14))
            for (_, quarter, etype) in EXAMS:
                exam = exams[(ay, level, quarter, etype)]
                for subject in subjects[GROUP_OF[level]]:
                    score = round(min(max(rng.gauss(base, 12), 0), 100), 1)
                    batch.append(MarkEntry(exam=exam, student=student, subject=subject,
                                           score=Decimal(str(score)), grade=_grade(score),
                                           entered_by=self.user))
            if len(batch) >= BATCH:
                MarkEntry.objects.bulk_create(batch)
                rows += len(batch)
                batch = []
        MarkEntry.objects.bulk_create(batch)
        self._log('marks', rows + len(batch))

    def _fees(self, years, placed):
        rng = self.rng
        today = timezone.localdate()
        invoices, lines = [], []
        for (student, ay), level in placed.items():
            tuition = Decimal(900_000 if level.startswith('FORM') else 600_000)
            inv = Invoice(student=student, academic_year=ay, kind=InvoiceKind.ANNUAL,
                          amount_due=tuition, due_date=datetime.date(ay.year, 2, 28),
                          status=InvoiceStatus.UNPAID)
            invoices.append(inv)
            lines.append(InvoiceLine(invoice=inv, category=FeeCategory.TUITION, level_snapshot=level,
                                     amount=tuition, created_by=self.user,
                                     created_at=_aware(datetime.date(ay.year, 1, 8))))
            takes_transport = rng.random() < 0.4
            for term, quarter in QUARTERS:
                qstart = getattr(ay, f'{quarter.lower()}_start')
                inv = Invoice(student=student, academic_year=ay, kind=InvoiceKind.QUARTERLY,
                              term=term, quarter=quarter, amount_due=0,
                              due_date=qstart + datetime.timedelta(days=30), status=InvoiceStatus.UNPAID)
                invoices.append(inv)
                charges = [(FeeCategory.LUNCH, Decimal(120_000))]
                if takes_transport:
                    charges.append((FeeCategory.TRANSPORT, Decimal(150_000)))
                for category, amount in charges:
                    lines.append(InvoiceLine(invoice=inv, category=category, level_snapshot=level,
                                             amount=amount, created_by=self.user,
                                             created_at=_aware(qstart)))
            if rng.random() < 0.3:
                sold = datetime.date(ay.year, rng.randrange(1, 12), rng.randrange(1, 28))
                inv = Invoice(student=student, academic_year=ay, kind=InvoiceKind.SALE,
                              amount_due=0, due_date=sold, status=InvoiceStatus.UNPAID)
                invoices.append(inv)
                lines.append(InvoiceLine(invoice=inv, category=FeeCategory.UNIFORM, level_snapshot=level,
                                         amount=Decimal(45_000), is_sale=True, created_by=self.user,
                                         created_at=_aware(sold)))
        Invoice.objects.bulk_create(invoices, batch_size=BATCH)
        for line in lines:
            line.invoice_id = line.invoice.pk
        InvoiceLine.objects.bulk_create(lines, batch_size=BATCH)
        self._log('invoices', len(invoices))
        self._log('invoice lines', len(lines))

        adjustments = [
            FeeAdjustment(invoice_line=line, kind=rng.choice(FeeAdjustment.Kind.values),
                          amount=(line.amount * Decimal('0.25')).quantize(Decimal('1')),
                          reason='Bench', approved_by=self.user,
                          created_at=line.created_at)
            for line in lines if not line.is_sale and rng.random() < 0.05
        ]
        FeeAdjustment.objects.bulk_create(adjustments, batch_size=BATCH)
        self._log('adjustments', len(adjustments))

        # Most fees are paid, some in parts, some late; a few stay unpaid.
        payments, allocations = [], []
        methods = [PaymentMethod.MPESA, PaymentMethod.AIRTEL, PaymentMethod.CASH, PaymentMethod.BANK_TRANSFER]
        for line in lines:
            if line.is_sale:
                parts = [line.amount]
            else:
                paid = rng.random()
                if paid < 0.12:
                    continue
                share = Decimal(1) if paid > 0.3 else Decimal(rng.choice(['0.5', '0.75']))
                total = (line.amount * share).quantize(Decimal('1'))
                parts = [total] if rng.random() < 0.7 else [total / 2, total - total / 2]
            for part in parts:
                when = min(line.created_at.date() + datetime.timedelta(days=rng.randrange(0, 120)), today)
                reversed_ = rng.random() < 0.01
                payment = Payment(
                    student_id=line.invoice.student_id, amount=part,
                    payment_method=rng.choice(methods), paid_at=_aware(when, rng.randrange(8, 17)),
                    received_by=self.user, receipt_number=f'BENCH{len(payments) + 1:08d}',
                    status=PaymentStatus.REVERSED if reversed_ else PaymentStatus.ACTIVE,
                    reversed_at=_aware(when + datetime.timedelta(days=2)) if reversed_ else None,
                )
                payments.append(payment)
                allocations.append(PaymentAllocation(payment=payment, invoice_line=line, amount=part))
        Payment.objects.bulk_create(payments, batch_size=BATCH)
        for alloc in allocations:
            alloc.payment_id = alloc.payment.pk
        PaymentAllocation.objects.bulk_create(allocations, batch_size=BATCH)
        self._log('payments', len(payments))
        self._log('allocations', len(allocations))

    def _sms(self, years, students, placed):
        rng = self.rng
        today = timezone.localdate()
        kinds = [SmsBatch.Kind.FEE_REMINDER, SmsBatch.Kind.EXAM_RESULTS, SmsBatch.Kind.ANNOUNCEMENT,
                 SmsBatch.Kind.TERM_DATES]
        statuses = ([SmsMessage.Status.DELIVERED] * 80 + [SmsMessage.Status.SENT] * 10
                    + [SmsMessage.Status.FAILED] * 4 + [SmsMessage.Status.SKIPPED] * 6)
        batches, messages = [], []
        for ay in years:
            at_school = [st for st in students if (st, ay) in placed]
            # Two school-wide messages a month, ten months a year.
            for month in range(1, 11):
                for day in (5, 20):
                    sent = datetime.date(ay.year, month, day)
                    if sent > today:
                        continue
                    batch = SmsBatch(kind=rng.choice(kinds), status=SmsBatch.Status.COMPLETED,
                                     created_by=self.user, dry_run=rng.random() < 0.05,
                                     created_at=_aware(sent))
                    batches.append(batch)
                    for st in at_school:
                        status = rng.choice(statuses)
                        messages.append(SmsMessage(
                            batch=batch, student=st, recipient_phone='+255700000000', body='Bench',
                            status=status, segments=0 if status == SmsMessage.Status.SKIPPED else 1,
                            cost=Decimal('0') if status == SmsMessage.Status.SKIPPED else Decimal('18'),
                            created_at=batch.created_at,
                        ))
        SmsBatch.objects.bulk_create(batches, batch_size=BATCH)
        for m in messages:
            m.batch_id = m.batch.pk
        SmsMessage.objects.bulk_create(messages, batch_size=BATCH)
        self._log('SMS batches', len(batches))
        self._log('SMS messages', len(messages))

    def _class_teacher(self, year):
        """One class teacher (FORM1 A, this year), for the scoped shapes."""
        from shule.factories import make_staff
        staff = make_staff(role=Role.CLASS_TEACHER)
        ClassTeacherAssignment.objects.create(teacher=staff, level=Level.FORM1, stream='A',
                                              academic_year=year, assigned_by=self.user)
        self._log('class teacher', 1)
