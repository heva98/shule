from importlib import import_module

from django.apps import apps
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import AuditLog, Role
from shule.factories import make_academic_year, make_staff, make_stream, make_student, make_user
from staff.models import ClassTeacherAssignment

from .models import Enrolment, Stream, Student

normalize_migration = import_module('students.migrations.0010_normalize_streams')


class StreamFieldTests(TestCase):
    def test_save_uppercases(self):
        student = make_student(stream=' blue ')
        self.assertEqual(student.stream, 'BLUE')
        student.refresh_from_db()
        self.assertEqual(student.stream, 'BLUE')

    def test_queryset_update_uppercases(self):
        student = make_student(stream='A')
        Student.objects.filter(pk=student.pk).update(stream='b')
        student.refresh_from_db()
        self.assertEqual(student.stream, 'B')

    def test_lowercase_lookup_matches(self):
        student = make_student(stream='A')
        self.assertEqual(list(Student.objects.filter(stream='a')), [student])

    def test_enrolment_mirrors_uppercased_value(self):
        make_academic_year(is_current=True)
        student = make_student(stream='c')
        self.assertEqual(Enrolment.objects.get(student=student).stream, 'C')

    def test_stream_name_uppercased(self):
        self.assertEqual(Stream.objects.create(name=' red ').name, 'RED')


class StreamValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=make_user(role=Role.OWNER))
        self.payload = {
            'first_name': 'Asha', 'last_name': 'Juma', 'gender': 'F',
            'date_of_birth': '2015-01-01', 'level': 'STD3',
        }

    def test_unknown_stream_rejected(self):
        resp = self.client.post('/api/students/', {**self.payload, 'stream': 'Z'}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('stream', resp.data)

    def test_known_stream_accepted_in_any_case(self):
        make_stream('A')
        resp = self.client.post('/api/students/', {**self.payload, 'stream': 'a'}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(Student.objects.get(public_id=resp.data['public_id']).stream, 'A')

    def test_blank_stream_allowed(self):
        resp = self.client.post('/api/students/', {**self.payload, 'stream': ''}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_class_assignment_requires_known_stream(self):
        teacher = make_staff()
        ay = make_academic_year()
        resp = self.client.post('/api/staff/class-assignments/', {
            'teacher_id': teacher.id, 'level': 'STD1', 'stream': 'Q',
            'academic_year_id': ay.id,
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('stream', resp.data)


class StreamListTests(TestCase):
    def test_any_authenticated_user_can_list(self):
        make_stream('B')
        make_stream('A')
        client = APIClient()
        client.force_authenticate(user=make_user(role=Role.TEACHER))
        resp = client.get('/api/students/streams/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([s['name'] for s in resp.data], ['A', 'B'])

    def test_anonymous_cannot_list(self):
        self.assertEqual(APIClient().get('/api/students/streams/').status_code, 401)


class AdminStreamTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=make_user(role=Role.SYSTEM_ADMIN))

    def test_create_uppercases_and_audits(self):
        resp = self.client.post('/api/admin/streams/', {'name': ' blue '}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['name'], 'BLUE')
        self.assertTrue(AuditLog.objects.filter(action=AuditLog.Action.STREAM_ADDED).exists())

    def test_duplicate_rejected_case_insensitively(self):
        make_stream('A')
        resp = self.client.post('/api/admin/streams/', {'name': 'a'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_too_long_rejected(self):
        resp = self.client.post('/api/admin/streams/', {'name': 'X' * 11}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_teacher_cannot_manage(self):
        client = APIClient()
        client.force_authenticate(user=make_user(role=Role.HEADTEACHER))
        self.assertEqual(client.post('/api/admin/streams/', {'name': 'A'}, format='json').status_code, 403)

    def test_rename_unused(self):
        stream = make_stream('A')
        resp = self.client.put(f'/api/admin/streams/{stream.pk}/', {'name': 'green'}, format='json')
        self.assertEqual(resp.status_code, 200)
        stream.refresh_from_db()
        self.assertEqual(stream.name, 'GREEN')

    def test_rename_and_delete_refused_while_in_use(self):
        stream = make_stream('A')
        make_student(stream='A')
        list_resp = self.client.get('/api/admin/streams/')
        self.assertTrue(list_resp.data[0]['in_use'])
        resp = self.client.put(f'/api/admin/streams/{stream.pk}/', {'name': 'B'}, format='json')
        self.assertEqual(resp.status_code, 400)
        resp = self.client.delete(f'/api/admin/streams/{stream.pk}/')
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(Stream.objects.filter(pk=stream.pk).exists())

    def test_delete_unused(self):
        stream = make_stream('A')
        resp = self.client.delete(f'/api/admin/streams/{stream.pk}/')
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Stream.objects.exists())


class NormalizeStreamsMigrationTests(TestCase):
    """The data migration run against legacy mixed-case rows."""

    def _set_raw(self, obj, field, value):
        # Bypass StreamField normalisation to recreate pre-migration data.
        from django.db import connection
        table = obj._meta.db_table
        with connection.cursor() as cur:
            cur.execute(f'UPDATE {table} SET {field} = %s WHERE id = %s', [value, obj.pk])

    def test_uppercases_and_seeds_streams(self):
        student = make_student(stream='A')
        self._set_raw(student, 'stream', ' blue')
        normalize_migration.normalize_streams(apps, None)
        student.refresh_from_db()
        self.assertEqual(student.stream, 'BLUE')
        self.assertEqual(set(Stream.objects.values_list('name', flat=True)), {'BLUE'})

    def test_collision_left_unchanged(self):
        ay = make_academic_year()
        owner = make_user()
        upper = ClassTeacherAssignment.objects.create(
            teacher=make_staff(), level='STD1', stream='A', academic_year=ay, assigned_by=owner,
        )
        lower = ClassTeacherAssignment.objects.create(
            teacher=make_staff(), level='STD1', stream='B', academic_year=ay, assigned_by=owner,
        )
        self._set_raw(lower, 'stream', 'a')
        normalize_migration.normalize_streams(apps, None)
        lower.refresh_from_db()
        upper.refresh_from_db()
        self.assertEqual((upper.stream, lower.stream), ('A', 'a'))
