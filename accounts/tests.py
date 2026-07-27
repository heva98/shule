from django.test import TestCase
from rest_framework.test import APIClient

from shule.factories import make_user

from .models import Role


class AuthTests(TestCase):
    def test_login_with_valid_credentials_returns_tokens(self):
        make_user(role=Role.TEACHER, email='teacher@test.local', password='correct-pass123')
        client = APIClient()
        resp = client.post('/api/auth/login/', {
            'email': 'teacher@test.local', 'password': 'correct-pass123',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)
        self.assertIn('refresh', resp.data)

    def test_login_with_wrong_password_is_rejected(self):
        make_user(role=Role.TEACHER, email='teacher2@test.local', password='correct-pass123')
        client = APIClient()
        resp = client.post('/api/auth/login/', {
            'email': 'teacher2@test.local', 'password': 'wrong-pass',
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_me_endpoint_requires_authentication(self):
        client = APIClient()
        resp = client.get('/api/auth/me/')
        self.assertEqual(resp.status_code, 401)

    def test_me_endpoint_returns_own_profile(self):
        user = make_user(role=Role.HEADTEACHER, email='head@test.local')
        client = APIClient()
        client.force_authenticate(user=user)
        resp = client.get('/api/auth/me/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['email'], 'head@test.local')


class AdminPanelPermissionTests(TestCase):
    def test_disallowed_role_cannot_list_users(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.get('/api/admin/users/')
        self.assertEqual(resp.status_code, 403)

    def test_headteacher_cannot_access_admin_panel(self):
        # Admin panel is SYSTEM_ADMIN/OWNER only — even Headteacher is excluded.
        headteacher = make_user(role=Role.HEADTEACHER)
        client = APIClient()
        client.force_authenticate(user=headteacher)
        resp = client.get('/api/admin/users/')
        self.assertEqual(resp.status_code, 403)

    def test_owner_can_list_users(self):
        owner = make_user(role=Role.OWNER)
        client = APIClient()
        client.force_authenticate(user=owner)
        resp = client.get('/api/admin/users/')
        self.assertEqual(resp.status_code, 200)

    def test_system_admin_can_change_user_role(self):
        admin = make_user(role=Role.SYSTEM_ADMIN)
        target = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=admin)
        resp = client.put(f'/api/admin/users/{target.id}/role/', {
            'role': Role.BURSAR,
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        target.refresh_from_db()
        self.assertEqual(target.role, Role.BURSAR)

    def test_disallowed_role_cannot_change_user_role(self):
        teacher = make_user(role=Role.TEACHER)
        target = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.put(f'/api/admin/users/{target.id}/role/', {
            'role': Role.BURSAR,
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_disabling_user_without_reason_is_rejected(self):
        admin = make_user(role=Role.SYSTEM_ADMIN)
        target = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=admin)
        resp = client.put(f'/api/admin/users/{target.id}/toggle-active/', {}, format='json')
        self.assertEqual(resp.status_code, 400)
        target.refresh_from_db()
        self.assertTrue(target.is_active)

    def test_disabling_user_with_reason_persists_it(self):
        admin = make_user(role=Role.SYSTEM_ADMIN)
        target = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=admin)
        resp = client.put(f'/api/admin/users/{target.id}/toggle-active/', {
            'reason': 'Left the school',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['is_active'])
        self.assertEqual(resp.data['deactivation_reason'], 'Left the school')
        target.refresh_from_db()
        self.assertFalse(target.is_active)
        self.assertEqual(target.deactivation_reason, 'Left the school')

    def test_reinstating_user_clears_reason_without_needing_one(self):
        admin = make_user(role=Role.SYSTEM_ADMIN)
        target = make_user(role=Role.TEACHER, is_active=False)
        target.deactivation_reason = 'Disciplinary suspension'
        target.save(update_fields=['deactivation_reason'])
        client = APIClient()
        client.force_authenticate(user=admin)
        resp = client.put(f'/api/admin/users/{target.id}/toggle-active/', {}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['is_active'])
        self.assertEqual(resp.data['deactivation_reason'], '')
        target.refresh_from_db()
        self.assertTrue(target.is_active)
        self.assertEqual(target.deactivation_reason, '')
