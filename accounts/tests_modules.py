from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import AuditLog, Role, SchoolSettings
from shule.factories import make_user
from shule.modules import (
    OPTIONAL_MODULES, clear_module_cache, enabled_modules, licensed_modules, module_enabled,
)

URL = '/api/admin/modules/'
ALL = sorted(OPTIONAL_MODULES)


def client_for(role):
    client = APIClient()
    client.force_authenticate(user=make_user(role=role))
    return client


class ModuleCacheMixin:
    """The admin's choice is cached outside the test transaction, so clear
    it around every test or a rolled-back save would leak into the next."""

    def setUp(self):
        super().setUp()
        clear_module_cache()
        self.addCleanup(clear_module_cache)


def choose(modules):
    s = SchoolSettings.get_settings()
    s.enabled_modules = modules
    s.save()


@override_settings(ENABLED_MODULES=['exams', 'reports', 'fees'], LICENSED_MODULES=None)
class ResolutionTests(ModuleCacheMixin, TestCase):
    def test_env_applies_until_an_admin_saves(self):
        self.assertEqual(enabled_modules(), {'exams', 'reports', 'fees'})

    def test_admin_choice_replaces_env(self):
        choose(['analytics', 'library'])
        self.assertEqual(enabled_modules(), {'analytics', 'library'})
        self.assertFalse(module_enabled('fees'))

    def test_saving_takes_effect_at_once(self):
        self.assertTrue(module_enabled('fees'))  # caches the "no choice" state
        choose(['exams'])
        self.assertFalse(module_enabled('fees'))

    @override_settings(LICENSED_MODULES=['exams', 'reports'])
    def test_licence_narrows_both_sources(self):
        self.assertEqual(enabled_modules(), {'exams', 'reports'})
        choose(['exams', 'fees', 'analytics'])
        self.assertEqual(enabled_modules(), {'exams'})

    def test_unset_licence_means_everything(self):
        self.assertEqual(licensed_modules(), set(OPTIONAL_MODULES))

    @override_settings(ENABLED_MODULES=[])
    def test_empty_env_means_nothing(self):
        self.assertEqual(enabled_modules(), set())

    def test_admin_choice_gates_views(self):
        owner = client_for(Role.OWNER)
        with override_settings(ENABLED_MODULES=ALL):
            self.assertEqual(owner.get('/api/analytics/dimensions/').status_code, 200)
            choose([m for m in ALL if m != 'analytics'])
            self.assertEqual(owner.get('/api/analytics/dimensions/').status_code, 403)

    def test_user_payload_follows_admin_choice(self):
        choose(['library'])
        self.assertEqual(client_for(Role.OWNER).get('/api/auth/me/').data['enabled_modules'], ['library'])

    def test_fee_tasks_follow_admin_choice(self):
        from fees.tasks import resync_current_charges
        choose(['exams'])
        self.assertEqual(resync_current_charges(), {'skipped': 'fees module disabled'})


@override_settings(ENABLED_MODULES=['exams', 'reports', 'fees'], LICENSED_MODULES=None)
class AdminModulesEndpointTests(ModuleCacheMixin, TestCase):
    def test_only_admins(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)
        for role in (Role.HEADTEACHER, Role.BURSAR, Role.TEACHER, Role.PARENT):
            with self.subTest(role=role):
                self.assertEqual(client_for(role).get(URL).status_code, 403)
        for role in (Role.OWNER, Role.SYSTEM_ADMIN):
            with self.subTest(role=role):
                self.assertEqual(client_for(role).get(URL).status_code, 200)

    def test_get_lists_every_module(self):
        data = client_for(Role.SYSTEM_ADMIN).get(URL).data
        self.assertEqual(data['source'], 'env')
        by_key = {m['key']: m for m in data['modules']}
        self.assertEqual(set(by_key), set(OPTIONAL_MODULES))
        self.assertTrue(by_key['fees']['enabled'])
        self.assertFalse(by_key['analytics']['enabled'])
        self.assertTrue(by_key['analytics']['licensed'])
        self.assertEqual(by_key['reports']['requires'], ['exams'])
        self.assertEqual(by_key['fees']['label'], 'Fees')

    def test_put_switches_modules_and_is_audited(self):
        client = client_for(Role.SYSTEM_ADMIN)
        resp = client.put(URL, {'enabled': ['exams', 'reports', 'analytics']}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['source'], 'admin')
        self.assertEqual({m['key'] for m in resp.data['modules'] if m['enabled']},
                         {'exams', 'reports', 'analytics'})
        self.assertEqual(enabled_modules(), {'exams', 'reports', 'analytics'})

        log = AuditLog.objects.get(action=AuditLog.Action.MODULES_UPDATED)
        self.assertEqual(log.description, 'Modules switched on: Analytics; off: Fees')
        self.assertEqual(log.extra_data['off'], ['fees'])

    def test_switching_everything_off_is_allowed(self):
        resp = client_for(Role.OWNER).put(URL, {'enabled': []}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(enabled_modules(), set())

    @override_settings(LICENSED_MODULES=['exams', 'reports'])
    def test_rejects_unlicensed_modules(self):
        client = client_for(Role.SYSTEM_ADMIN)
        resp = client.put(URL, {'enabled': ['exams', 'fees']}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['enabled'], 'Not licensed for this school: Fees.')
        self.assertIsNone(SchoolSettings.get_settings().enabled_modules)

        by_key = {m['key']: m for m in client.get(URL).data['modules']}
        self.assertFalse(by_key['fees']['licensed'])
        self.assertFalse(by_key['fees']['enabled'])

    def test_rejects_missing_dependency(self):
        resp = client_for(Role.SYSTEM_ADMIN).put(URL, {'enabled': ['reports']}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['enabled'], 'Exam reports needs Exams switched on.')

    def test_rejects_bad_payloads(self):
        client = client_for(Role.SYSTEM_ADMIN)
        for body in ({}, {'enabled': 'fees'}, {'enabled': [1]}, {'enabled': ['nope']}):
            with self.subTest(body=body):
                self.assertEqual(client.put(URL, body, format='json').status_code, 400)

    def test_general_settings_endpoint_cannot_change_modules(self):
        client = client_for(Role.SYSTEM_ADMIN)
        client.put('/api/admin/settings/', {'enabled_modules': ['analytics']}, format='json')
        self.assertIsNone(SchoolSettings.get_settings().enabled_modules)
