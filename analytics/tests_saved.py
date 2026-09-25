from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_user

from .models import SavedVisualization
from .registry import unavailable_references
from .tests_registry import FULL_MODULES, MSEWE_MODULES

URL = '/api/analytics/visualizations/'


def config(**overrides):
    cfg = {
        'version': 1, 'type': 'COLUMN',
        'columns': ['dx'], 'rows': ['pe'], 'filters': ['ou'],
        'items': {'dx': ['enrol.enrolled'], 'pe': ['THIS_TERM'], 'ou': ['SCHOOL']},
        'options': {'showDataLabels': True},
    }
    cfg.update(overrides)
    return cfg


def fee_config():
    return config(items={'dx': ['fees.collected'], 'pe': ['THIS_TERM'], 'ou': ['SCHOOL']},
                  rows=['payment_method'], filters=['ou', 'pe'])


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def save(user, cfg=None, **extra):
    return SavedVisualization.objects.create(
        name=extra.pop('name', 'Enrolment by term'), created_by=user,
        config=cfg or config(), type=(cfg or config())['type'], **extra,
    )


@override_settings(ENABLED_MODULES=FULL_MODULES)
class SavedVisualizationApiTests(TestCase):
    def setUp(self):
        self.owner = make_user(role=Role.OWNER)
        self.head = make_user(role=Role.HEADTEACHER)
        self.client = client_for(self.owner)

    def test_create_derives_type_and_owner(self):
        resp = self.client.post(URL, {'name': '  Enrolment ', 'config': config(type='LINE')}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['name'], 'Enrolment')
        self.assertEqual(resp.data['type'], 'LINE')
        self.assertTrue(resp.data['is_owner'])
        self.assertFalse(resp.data['is_pinned'])
        self.assertEqual(resp.data['unavailable'], [])
        viz = SavedVisualization.objects.get()
        self.assertEqual(viz.created_by, self.owner)
        self.assertEqual(viz.config['options'], {'showDataLabels': True})

    def test_client_cannot_set_type_or_owner(self):
        resp = self.client.post(URL, {
            'name': 'x', 'config': config(), 'type': 'PIE', 'created_by': self.head.id,
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual((resp.data['type'], resp.data['created_by']), ('COLUMN', self.owner.id))

    def test_rejects_malformed_config(self):
        bad = [
            'not an object',
            config(type='RADAR'),
            config(rows='pe'),
            config(rows=['dx']),  # dx on two axes
            config(items={'dx': 'enrol.enrolled'}),
            config(options=[]),
            config(options={'pad': 'x' * 25_000}),
        ]
        for cfg in bad:
            with self.subTest(cfg=str(cfg)[:60]):
                resp = self.client.post(URL, {'name': 'x', 'config': cfg}, format='json')
                self.assertEqual(resp.status_code, 400)
                self.assertIn('config', resp.data)

    def test_rejects_blank_name(self):
        resp = self.client.post(URL, {'name': '   ', 'config': config()}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_rejects_metrics_the_caller_cannot_query(self):
        resp = self.client.post(URL, {
            'name': 'x', 'config': config(items={'dx': ['no.such_metric'], 'pe': [], 'ou': []}),
        }, format='json')
        self.assertEqual(resp.status_code, 400)

        # A class teacher has no fee metrics.
        teacher = client_for(make_user(role=Role.CLASS_TEACHER))
        resp = teacher.post(URL, {'name': 'x', 'config': fee_config()}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Collected (billing period)', str(resp.data['config']))

    def test_list_is_own_plus_shared(self):
        mine = save(self.owner, name='Mine')
        shared = save(self.head, name='Shared', shared_with_staff=True)
        save(self.head, name='Private')
        resp = self.client.get(URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([v['id'] for v in resp.data], [mine.id, shared.id])
        by_id = {v['id']: v for v in resp.data}
        self.assertFalse(by_id[shared.id]['is_owner'])
        self.assertEqual(by_id[shared.id]['created_by_name'], self.head.full_name)

    def test_search(self):
        save(self.owner, name='Fees by month')
        save(self.owner, name='Enrolment')
        resp = self.client.get(URL, {'search': 'fees'})
        self.assertEqual([v['name'] for v in resp.data], ['Fees by month'])

    def test_private_visualization_is_invisible_to_others(self):
        viz = save(self.head)
        self.assertEqual(self.client.get(f'{URL}{viz.id}/').status_code, 404)
        self.assertEqual(self.client.post(f'{URL}{viz.id}/pin/').status_code, 404)

    def test_rename_and_update_by_creator(self):
        viz = save(self.owner)
        resp = self.client.patch(f'{URL}{viz.id}/', {'name': 'Renamed'}, format='json')
        self.assertEqual(resp.status_code, 200)
        resp = self.client.patch(f'{URL}{viz.id}/', {'config': config(type='PIE', rows=[])}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        viz.refresh_from_db()
        self.assertEqual((viz.name, viz.type), ('Renamed', 'PIE'))

    def test_shared_is_read_only_for_others(self):
        viz = save(self.head, shared_with_staff=True)
        self.assertEqual(self.client.get(f'{URL}{viz.id}/').status_code, 200)
        self.assertEqual(self.client.patch(f'{URL}{viz.id}/', {'name': 'x'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'{URL}{viz.id}/').status_code, 403)
        self.assertTrue(SavedVisualization.objects.filter(pk=viz.pk).exists())

    def test_delete_by_creator(self):
        viz = save(self.owner)
        self.assertEqual(self.client.delete(f'{URL}{viz.id}/').status_code, 204)
        self.assertFalse(SavedVisualization.objects.exists())

    def test_pin_and_unpin_are_per_user(self):
        viz = save(self.head, shared_with_staff=True)
        self.assertEqual(self.client.post(f'{URL}{viz.id}/pin/').status_code, 204)
        self.assertEqual(self.client.post(f'{URL}{viz.id}/pin/').status_code, 204)  # idempotent

        resp = self.client.get(URL, {'pinned': 'true'})
        self.assertEqual([v['id'] for v in resp.data], [viz.id])
        self.assertTrue(resp.data[0]['is_pinned'])
        # The creator's dashboard is untouched.
        self.assertEqual(client_for(self.head).get(URL, {'pinned': 'true'}).data, [])

        self.assertEqual(self.client.delete(f'{URL}{viz.id}/pin/').status_code, 204)
        self.assertEqual(self.client.get(URL, {'pinned': 'true'}).data, [])

    def test_unsharing_removes_other_users_pins(self):
        viz = save(self.owner, shared_with_staff=True)
        viz.pinned_by.add(self.owner, self.head)
        self.client.patch(f'{URL}{viz.id}/', {'shared_with_staff': False}, format='json')
        self.assertEqual(list(viz.pinned_by.all()), [self.owner])

    def test_owner_and_system_admin_have_full_access(self):
        for role in (Role.OWNER, Role.SYSTEM_ADMIN):
            with self.subTest(role=role):
                client = client_for(make_user(role=role))
                resp = client.post(URL, {'name': 'Fees', 'config': fee_config()}, format='json')
                self.assertEqual(resp.status_code, 201, resp.data)
                self.assertEqual(resp.data['unavailable'], [])
                self.assertEqual(client.post(f"{URL}{resp.data['id']}/pin/").status_code, 204)
                self.assertEqual(len(client.get(URL, {'pinned': 'true'}).data), 1)

    def test_non_analytics_roles_are_forbidden(self):
        for role in (Role.PARENT, Role.STUDENT, Role.TEACHER):
            with self.subTest(role=role):
                self.assertEqual(client_for(make_user(role=role)).get(URL).status_code, 403)

    def test_shared_with_a_role_that_lacks_the_metric(self):
        save(self.owner, fee_config(), name='Fees', shared_with_staff=True)
        data = client_for(make_user(role=Role.CLASS_TEACHER)).get(URL).data
        self.assertEqual(
            {(u['kind'], u['id'], u['reason']) for u in data[0]['unavailable']},
            {('metric', 'fees.collected', 'no_access'), ('dimension', 'payment_method', 'no_access')},
        )


@override_settings(ENABLED_MODULES=[m for m in FULL_MODULES if m != 'analytics'])
class ModuleOffTests(TestCase):
    def test_forbidden_when_analytics_disabled(self):
        self.assertEqual(client_for(make_user(role=Role.OWNER)).get(URL).status_code, 403)


@override_settings(ENABLED_MODULES=MSEWE_MODULES)
class DisabledModuleReferenceTests(TestCase):
    """A visualization saved while fees was on keeps working as a record, and
    reports what the deployment can no longer draw."""

    def test_disabled_module_metric_is_reported(self):
        owner = make_user(role=Role.OWNER)
        save(owner, fee_config(), name='Fees')
        data = client_for(owner).get(URL).data
        refs = {u['id']: u for u in data[0]['unavailable']}
        self.assertEqual(refs['fees.collected']['reason'], 'module_disabled')
        self.assertEqual(refs['fees.collected']['label'], 'Collected (billing period)')
        self.assertEqual(refs['fees.collected']['modules'], ['fees'])
        self.assertEqual(refs['payment_method']['reason'], 'module_disabled')

    def test_can_still_rename_and_delete(self):
        owner = make_user(role=Role.OWNER)
        viz = save(owner, fee_config())
        client = client_for(owner)
        self.assertEqual(client.patch(f'{URL}{viz.id}/', {'name': 'Old fees'}, format='json').status_code, 200)
        self.assertEqual(client.delete(f'{URL}{viz.id}/').status_code, 204)


class UnavailableReferencesTests(TestCase):
    @override_settings(ENABLED_MODULES=[m for m in FULL_MODULES if m != 'exams'])
    def test_dimension_whose_sources_need_a_disabled_module(self):
        refs = unavailable_references(config(rows=['subject']), Role.OWNER)
        self.assertEqual(refs, [{
            'kind': 'dimension', 'id': 'subject', 'label': 'Subject',
            'reason': 'module_disabled', 'modules': ['exams'],
        }])

    @override_settings(ENABLED_MODULES=FULL_MODULES)
    def test_garbage_config_is_tolerated(self):
        self.assertEqual(unavailable_references(None, Role.OWNER), [])
        self.assertEqual(unavailable_references({'items': {'dx': 'x'}, 'rows': 'y'}, Role.OWNER), [])
        refs = unavailable_references(config(filters=['nope']), Role.OWNER)
        self.assertEqual([(r['id'], r['reason']) for r in refs], [('nope', 'unknown')])
