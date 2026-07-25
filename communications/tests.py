from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_user


class CommunicationsPermissionTests(TestCase):
    def test_teacher_cannot_broadcast(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.post('/api/communications/broadcast/', {
            'body': 'Hello school', 'message_type': 'SMS', 'audience': 'SCHOOL',
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_headteacher_can_broadcast(self):
        headteacher = make_user(role=Role.HEADTEACHER)
        client = APIClient()
        client.force_authenticate(user=headteacher)
        resp = client.post('/api/communications/broadcast/', {
            'body': 'Hello school', 'message_type': 'SMS', 'audience': 'SCHOOL',
        }, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_parent_cannot_view_message_history(self):
        parent = make_user(role=Role.PARENT)
        client = APIClient()
        client.force_authenticate(user=parent)
        resp = client.get('/api/communications/history/')
        self.assertEqual(resp.status_code, 403)

    def test_academic_teacher_can_view_message_history(self):
        academic_teacher = make_user(role=Role.ACADEMIC_TEACHER)
        client = APIClient()
        client.force_authenticate(user=academic_teacher)
        resp = client.get('/api/communications/history/')
        self.assertEqual(resp.status_code, 200)

    def test_teacher_cannot_send_absence_alerts(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.post('/api/communications/send-absence-alerts/', {}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_teacher_cannot_send_fee_reminder(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.post('/api/communications/fee-reminders/', {
            'student_id': 'DOES-NOT-EXIST',
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_bursar_can_reach_fee_reminder_endpoint(self):
        # Bursar can't reach Communications page but does send single fee
        # reminders from the Fees page — 404 (no such student) proves the
        # permission check passed and we reached the view's own logic.
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.post('/api/communications/fee-reminders/', {
            'student_id': 'DOES-NOT-EXIST',
        }, format='json')
        self.assertEqual(resp.status_code, 404)

    def test_any_authenticated_user_can_read_announcements(self):
        parent = make_user(role=Role.PARENT)
        client = APIClient()
        client.force_authenticate(user=parent)
        resp = client.get('/api/communications/announcements/')
        self.assertEqual(resp.status_code, 200)

    def test_demo_request_is_public(self):
        client = APIClient()
        resp = client.post('/api/communications/demo-requests/', {
            'full_name': 'Prospective Parent', 'email': 'prospect@test.local',
            'phone': '+255712345678', 'message': 'Interested in a demo.',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
