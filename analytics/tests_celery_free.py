"""
Analytics must work without Celery: Msewe runs no worker or beat, so a task
queued from analytics would never run, and a broker call could hang the
request. Everything analytics does happens inside the request.

Two checks:

* statically, no analytics module imports celery, defines a task, or calls
  `.delay()` / `.apply_async()` / `send_task()`;
* at runtime, with Celery's dispatch patched to fail, every analytics
  endpoint still works under Msewe's module list. That catches an indirect
  path (a signal, `log_action`, a helper in another app) that the static
  check can't see.
"""
import ast
import datetime
from pathlib import Path
from unittest import mock

from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import Role
from exams.models import Exam, ExamType, MarkEntry
from fees.models import AcademicYear
from shule.factories import make_stream, make_student, make_subject, make_user

from .tests_registry import MSEWE_MODULES

APP_DIR = Path(__file__).resolve().parent
QUEUE_CALLS = {'delay', 'apply_async', 'send_task', 'shared_task', 'task'}


def _app_modules():
    """Every non-test Python file of the analytics app, including its
    management commands and migrations."""
    return sorted(
        p for p in APP_DIR.rglob('*.py')
        if not p.name.startswith('tests_') and '__pycache__' not in p.parts
    )


class StaticCeleryFreeTests(SimpleTestCase):
    def test_no_module_imports_celery(self):
        offenders = []
        for path in _app_modules():
            for node in ast.walk(ast.parse(path.read_text(encoding='utf-8-sig'))):
                names = []
                if isinstance(node, ast.Import):
                    names = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom) and node.module:
                    names = [node.module]
                    if node.module.startswith('shule') or node.level:
                        names += [f'{node.module}.{a.name}' for a in node.names]
                for name in names:
                    if name.split('.')[0] == 'celery' or name in ('shule.celery', 'shule.celery.app'):
                        offenders.append(f'{path.relative_to(APP_DIR)}:{node.lineno} imports {name}')
        self.assertEqual(offenders, [])

    def test_no_task_is_queued_or_defined(self):
        offenders = []
        for path in _app_modules():
            for node in ast.walk(ast.parse(path.read_text(encoding='utf-8-sig'))):
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) \
                        and node.func.attr in QUEUE_CALLS:
                    offenders.append(f'{path.relative_to(APP_DIR)}:{node.lineno} calls .{node.func.attr}()')
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    for deco in node.decorator_list:
                        target = deco.func if isinstance(deco, ast.Call) else deco
                        name = getattr(target, 'attr', None) or getattr(target, 'id', None)
                        if name in QUEUE_CALLS:
                            offenders.append(f'{path.relative_to(APP_DIR)}:{node.lineno} '
                                             f'defines a task ({node.name})')
        self.assertEqual(offenders, [])

    def test_no_tasks_module(self):
        self.assertFalse((APP_DIR / 'tasks.py').exists())


def _no_celery(*args, **kwargs):
    raise AssertionError('analytics must not dispatch Celery work (Msewe has no worker)')


@override_settings(ENABLED_MODULES=MSEWE_MODULES)
@mock.patch('celery.app.base.Celery.send_task', side_effect=_no_celery)
@mock.patch('celery.app.task.Task.apply_async', side_effect=_no_celery)
class RuntimeCeleryFreeTests(TestCase):
    """Every analytics endpoint, as Msewe runs it, with Celery unusable."""

    def setUp(self):
        year = AcademicYear.objects.create(year=2026, is_current=True)
        teacher = make_user(role=Role.ACADEMIC_TEACHER)
        math = make_subject(level_group='OLEVEL', code='MATH', name='Mathematics')
        make_stream('A')
        exam = Exam.objects.create(
            name='Midterm', academic_year=year, term='TERM1', quarter='Q1', level='FORM1',
            exam_type=ExamType.MIDTERM, start_date=datetime.date(2026, 3, 1),
            end_date=datetime.date(2026, 3, 5), created_by=teacher,
        )
        for score in (40, 60, 80, 55, 70):
            pupil = make_student(level='FORM1', stream='A')
            MarkEntry.objects.create(exam=exam, student=pupil, subject=math, score=score,
                                     entered_by=teacher)
        self.client = APIClient()
        self.client.force_authenticate(user=make_user(role=Role.HEADTEACHER))

    def _ok(self, resp, status=200):
        self.assertEqual(resp.status_code, status, getattr(resp, 'data', resp))
        return resp

    def test_every_endpoint_works_without_a_worker(self, apply_async, send_task):
        base = '/api/analytics'
        self._ok(self.client.get(f'{base}/dimensions/'))
        query = 'dimension=dx:exam.mean_score;enrol.enrolled&dimension=pe:2026&dimension=ou:FORM1'
        self._ok(self.client.get(f'{base}/query/?{query}'))
        self._ok(self.client.get(f'{base}/drilldown/?dimension=dx:exam.mean_score'
                                 '&filter=pe:2026T1&filter=ou:FORM1'))

        viz = self._ok(self.client.post(f'{base}/visualizations/', {
            'name': 'Form 1 maths', 'shared_with_staff': True,
            'config': {
                'version': 1, 'type': 'PIVOT_TABLE', 'columns': ['dx'], 'rows': ['ou'],
                'filters': ['pe'], 'options': {},
                'items': {'dx': ['exam.mean_score'], 'pe': ['2026'], 'ou': ['FORM1']},
            },
        }, format='json'), 201).data
        url = f"{base}/visualizations/{viz['id']}/"
        self._ok(self.client.get(f'{base}/visualizations/'))
        self._ok(self.client.patch(url, {'name': 'Form 1 maths (2026)'}, format='json'))
        self._ok(self.client.post(f'{url}pin/'), 204)
        self._ok(self.client.delete(f'{url}pin/'), 204)
        self._ok(self.client.delete(url), 204)

        apply_async.assert_not_called()
        send_task.assert_not_called()
