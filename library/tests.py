import datetime

from django.test import TransactionTestCase
from rest_framework.test import APIClient

from accounts.models import Role
from shule.factories import make_student, make_user, run_concurrently

from .models import Book, BorrowRecord


class LibraryCapacityLockingTests(TransactionTestCase):
    """Regression test for the select_for_update() race-condition fix — two
    concurrent borrow requests for the last copy of a book must not both succeed."""

    def test_concurrent_borrow_of_last_copy_only_one_succeeds(self):
        owner = make_user(role=Role.OWNER)
        book = Book.objects.create(title='Test Book', author='Author', total_copies=1)
        student_a = make_student()
        student_b = make_student()
        due_date = str(datetime.date.today() + datetime.timedelta(days=14))

        def borrow(student):
            client = APIClient()
            client.force_authenticate(user=owner)
            resp = client.post('/api/library/borrow-records/', {
                'book': book.id,
                'student': student.id,
                'due_date': due_date,
            }, format='json')
            return resp.status_code

        codes = run_concurrently(lambda: borrow(student_a), lambda: borrow(student_b))

        self.assertEqual(sorted(codes), [201, 400])
        self.assertEqual(BorrowRecord.objects.filter(book=book).count(), 1)


class LibraryPermissionTests(TransactionTestCase):
    def setUp(self):
        self.book = Book.objects.create(title='Perm Book', author='Author', total_copies=5)
        self.student = make_student()
        self.due_date = str(datetime.date.today() + datetime.timedelta(days=14))

    def test_disallowed_role_cannot_issue_book(self):
        teacher = make_user(role=Role.TEACHER)
        client = APIClient()
        client.force_authenticate(user=teacher)
        resp = client.post('/api/library/borrow-records/', {
            'book': self.book.id,
            'student': self.student.id,
            'due_date': self.due_date,
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_librarian_can_issue_book(self):
        librarian = make_user(role=Role.LIBRARIAN)
        client = APIClient()
        client.force_authenticate(user=librarian)
        resp = client.post('/api/library/borrow-records/', {
            'book': self.book.id,
            'student': self.student.id,
            'due_date': self.due_date,
        }, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_disallowed_role_cannot_create_book(self):
        bursar = make_user(role=Role.BURSAR)
        client = APIClient()
        client.force_authenticate(user=bursar)
        resp = client.post('/api/library/books/', {
            'title': 'New Book', 'author': 'Someone', 'total_copies': 3,
        }, format='json')
        self.assertEqual(resp.status_code, 403)
