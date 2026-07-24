from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_student, make_user

from .models import DocumentCategory, StudentDocument


class DocumentPermissionTests(TransactionTestCase):
    """The whole viewset (including read) is restricted to senior staff — students'
    birth certificates, medical forms etc. are sensitive."""

    def setUp(self):
        self.student = make_student()

    def _upload(self):
        return SimpleUploadedFile('cert.pdf', b'fake-pdf-bytes', content_type='application/pdf')

    def test_disallowed_role_cannot_list_documents(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.get('/api/documents/')
        self.assertEqual(resp.status_code, 403)

    def test_disallowed_role_cannot_upload_document(self):
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.post('/api/documents/', {
            'student': self.student.id,
            'category': DocumentCategory.BIRTH_CERTIFICATE,
            'file': self._upload(),
        }, format='multipart')
        self.assertEqual(resp.status_code, 403)

    def test_headteacher_can_upload_and_list_documents(self):
        headteacher = make_user(role=Role.HEADTEACHER)
        client = APIClient()
        client.force_authenticate(user=headteacher)
        resp = client.post('/api/documents/', {
            'student': self.student.id,
            'category': DocumentCategory.BIRTH_CERTIFICATE,
            'file': self._upload(),
        }, format='multipart')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(StudentDocument.objects.filter(student=self.student).count(), 1)

        list_resp = client.get('/api/documents/')
        self.assertEqual(list_resp.status_code, 200)
