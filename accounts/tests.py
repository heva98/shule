from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from shule.factories import make_user

from .models import AuditLog, Role


class AuthTests(TestCase):
    def setUp(self):
        # The login endpoint's ScopedRateThrottle (5/min, keyed by IP) shares
        # its counter across every test in this process via the cache — clear
        # it so one test's login attempts don't 429 the next.
        cache.clear()

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


class AccountLockoutTests(TestCase):
    def setUp(self):
        cache.clear()  # reset the login endpoint's throttle history between tests

    def _login(self, client, email, password):
        return client.post('/api/auth/login/', {'email': email, 'password': password}, format='json')

    def test_third_consecutive_failure_locks_the_account(self):
        user = make_user(role=Role.TEACHER, email='lockout1@test.local', password='correct-pass123')
        client = APIClient()

        for _ in range(user.LOCKOUT_THRESHOLD):
            resp = self._login(client, user.email, 'wrong-pass')
            self.assertEqual(resp.status_code, 400)

        user.refresh_from_db()
        self.assertEqual(user.failed_login_attempts, user.LOCKOUT_THRESHOLD)
        self.assertIsNotNone(user.locked_until)
        self.assertTrue(user.is_locked_out())

        # Even the correct password is rejected while locked.
        resp = self._login(client, user.email, 'correct-pass123')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Too many failed login attempts', str(resp.data))

    def test_lockout_is_audit_logged(self):
        user = make_user(role=Role.TEACHER, email='lockout2@test.local', password='correct-pass123')
        client = APIClient()
        for _ in range(user.LOCKOUT_THRESHOLD):
            self._login(client, user.email, 'wrong-pass')

        log = AuditLog.objects.filter(
            action=AuditLog.Action.ACCOUNT_LOCKED, target_model='User', target_id=str(user.pk),
        ).first()
        self.assertIsNotNone(log)
        self.assertIsNone(log.performed_by)

    def test_successful_login_resets_failed_attempts(self):
        user = make_user(role=Role.TEACHER, email='lockout3@test.local', password='correct-pass123')
        client = APIClient()

        # Two failures — below the lockout threshold.
        self._login(client, user.email, 'wrong-pass')
        self._login(client, user.email, 'wrong-pass')
        user.refresh_from_db()
        self.assertEqual(user.failed_login_attempts, 2)

        resp = self._login(client, user.email, 'correct-pass123')
        self.assertEqual(resp.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.failed_login_attempts, 0)
        self.assertIsNone(user.locked_until)

    def test_admin_password_reset_clears_lockout(self):
        admin = make_user(role=Role.SYSTEM_ADMIN)
        user = make_user(role=Role.TEACHER, email='lockout4@test.local', password='correct-pass123')
        user.failed_login_attempts = user.LOCKOUT_THRESHOLD
        user.locked_until = timezone.now() + user.LOCKOUT_DURATION
        user.save(update_fields=['failed_login_attempts', 'locked_until'])

        client = APIClient()
        client.force_authenticate(user=admin)
        resp = client.put(f'/api/admin/users/{user.id}/reset-password/', {
            'new_password': 'BrandNewPass123', 'notify': False,
        }, format='json')
        self.assertEqual(resp.status_code, 200)

        user.refresh_from_db()
        self.assertEqual(user.failed_login_attempts, 0)
        self.assertIsNone(user.locked_until)

    def test_reinstating_account_clears_lockout(self):
        admin = make_user(role=Role.SYSTEM_ADMIN)
        user = make_user(role=Role.TEACHER, is_active=False)
        user.failed_login_attempts = user.LOCKOUT_THRESHOLD
        user.locked_until = timezone.now() + user.LOCKOUT_DURATION
        user.save(update_fields=['failed_login_attempts', 'locked_until'])

        client = APIClient()
        client.force_authenticate(user=admin)
        resp = client.put(f'/api/admin/users/{user.id}/toggle-active/', {}, format='json')
        self.assertEqual(resp.status_code, 200)

        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertEqual(user.failed_login_attempts, 0)
        self.assertIsNone(user.locked_until)
