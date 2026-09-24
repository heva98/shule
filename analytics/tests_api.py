from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import Role
from fees.models import AcademicYear
from shule.factories import make_student, make_user

from .tests_registry import FULL_MODULES, MSEWE_MODULES

URL = '/api/analytics/dimensions/'


def _client(role):
    client = APIClient()
    client.force_authenticate(user=make_user(role=role))
    return client


def _dim(payload, dim_id):
    return next((d for d in payload['dimensions'] if d['id'] == dim_id), None)


@override_settings(ENABLED_MODULES=FULL_MODULES)
class DimensionsEndpointTests(TestCase):
    def setUp(self):
        AcademicYear.objects.create(year=2026, is_current=True)
        make_student(level='FORM1', stream='a')

    def test_requires_authentication(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)

    def test_non_analytics_roles_are_forbidden(self):
        for role in (Role.PARENT, Role.STUDENT, Role.TEACHER, Role.SUBJECT_TEACHER,
                     Role.DISCIPLINE_TEACHER):
            with self.subTest(role=role):
                self.assertEqual(_client(role).get(URL).status_code, 403)

    def test_owner_gets_the_full_catalogue(self):
        resp = _client(Role.OWNER).get(URL)
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertEqual({g['id'] for g in data['groups']},
                         {'enrolment', 'academics', 'fees', 'sms'})

        metric_ids = {m['id'] for m in _dim(data, 'dx')['items']}
        self.assertTrue({'enrol.enrolled', 'exam.mean_score', 'fees.collected',
                         'sms.messages'} <= metric_ids)

        pe = _dim(data, 'pe')
        self.assertIn('THIS_TERM', {i['id'] for i in pe['items']})
        self.assertIn('2026', {i['id'] for i in pe['items']})

        ou = _dim(data, 'ou')
        school = ou['items'][0]
        olevel = next(g for g in school['children'] if g['id'] == 'OLEVEL')
        form1 = next(lv for lv in olevel['children'] if lv['id'] == 'FORM1')
        self.assertEqual([s['id'] for s in form1['children']], ['FORM1/A'])

    def test_no_orm_paths_leak(self):
        body = _client(Role.OWNER).get(URL).content.decode()
        self.assertNotIn('__', body)

    def test_bursar_catalogue_is_role_scoped(self):
        data = _client(Role.BURSAR).get(URL).data
        self.assertEqual({g['id'] for g in data['groups']}, {'enrolment', 'fees'})
        self.assertIsNone(_dim(data, 'subject'))
        self.assertIsNotNone(_dim(data, 'payment_method'))


@override_settings(ENABLED_MODULES=[m for m in FULL_MODULES if m != 'analytics'])
class AnalyticsModuleOffTests(TestCase):
    def test_forbidden_when_module_disabled(self):
        self.assertEqual(_client(Role.OWNER).get(URL).status_code, 403)


@override_settings(ENABLED_MODULES=MSEWE_MODULES)
class MseweCatalogueTests(TestCase):
    def test_no_fee_metrics_or_dimensions(self):
        data = _client(Role.OWNER).get(URL).data
        self.assertEqual({g['id'] for g in data['groups']}, {'enrolment', 'academics'})
        self.assertFalse([m for m in _dim(data, 'dx')['items'] if m['id'].startswith('fees.')])
        for dim_id in ('fee_category', 'payment_method', 'invoice_kind', 'sms_status'):
            self.assertIsNone(_dim(data, dim_id), dim_id)

    def test_bursar_only_sees_enrolment(self):
        data = _client(Role.BURSAR).get(URL).data
        self.assertEqual({g['id'] for g in data['groups']}, {'enrolment'})
