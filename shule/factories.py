"""
Shared test-data builders. Not itself a test module (doesn't match Django's
`test*.py` discovery pattern) — imported by each app's tests.py to avoid
re-deriving the same User/Student/StaffProfile/AcademicYear boilerplate.
"""
import datetime
import itertools
import threading

from django.db import connection

from accounts.models import Role, User
from fees.models import AcademicYear
from staff.models import ContractType, Designation, StaffProfile
from students.models import Student

_counter = itertools.count(1)


def run_concurrently(*funcs):
    """
    Run each zero-arg callable in its own thread, synchronized to start at
    the same moment (via a barrier), and return their return values in the
    same order as `funcs`. Closes each thread's DB connection afterwards so
    TransactionTestCase can tear down the test database cleanly.

    Used to exercise select_for_update()-style locking under genuine
    concurrent load rather than sequential calls.
    """
    barrier = threading.Barrier(len(funcs))
    results = [None] * len(funcs)

    def run(index, fn):
        try:
            barrier.wait(timeout=5)
            results[index] = fn()
        finally:
            connection.close()

    threads = [threading.Thread(target=run, args=(i, fn)) for i, fn in enumerate(funcs)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


def make_user(role=Role.OWNER, **extra):
    n = next(_counter)
    extra.setdefault('email', f'{role.lower()}{n}@test.local')
    extra.setdefault('full_name', f'Test {role.title()} {n}')
    password = extra.pop('password', 'testpass123')
    user = User.objects.create_user(role=role, password=password, **extra)
    user.raw_password = password
    return user


def make_staff(role=Role.TEACHER, designation=Designation.TEACHER, **extra):
    user = make_user(role=role)
    staff = StaffProfile.objects.create(
        user=user,
        designation=designation,
        hire_date=datetime.date(2024, 1, 1),
        contract_type=ContractType.PERMANENT,
    )
    return staff


def make_academic_year(year=None, is_current=True):
    n = next(_counter)
    return AcademicYear.objects.create(year=year or (2000 + n), is_current=is_current)


def make_student(gender='M', level='STD1', **extra):
    n = next(_counter)
    extra.setdefault('first_name', f'Student{n}')
    extra.setdefault('last_name', 'Test')
    extra.setdefault('date_of_birth', datetime.date(2012, 1, 1))
    extra.setdefault('student_id', f'TST-{n:04d}')
    return Student.objects.create(gender=gender, level=level, **extra)


def make_subject(level_group='PRIMARY', **extra):
    from exams.models import Subject
    n = next(_counter)
    extra.setdefault('name', f'Subject {n}')
    extra.setdefault('code', f'SUB{n}')
    return Subject.objects.create(level_group=level_group, **extra)
