from django.conf import settings
from django.db import models
from django.utils import timezone


class Book(models.Model):
    """A catalog entry — total_copies covers how many physical copies the
    school owns; availability is derived from currently active borrows."""
    title = models.CharField(max_length=255)
    author = models.CharField(max_length=255, blank=True)
    isbn = models.CharField(max_length=20, blank=True)
    category = models.CharField(max_length=100, blank=True)
    publisher = models.CharField(max_length=150, blank=True)
    publication_year = models.PositiveIntegerField(null=True, blank=True)
    shelf_location = models.CharField(max_length=50, blank=True)
    total_copies = models.PositiveIntegerField(default=1)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return f'{self.title} — {self.author}' if self.author else self.title

    @property
    def borrowed_count(self):
        return self.borrow_records.filter(status=BorrowStatus.BORROWED).count()

    @property
    def available_copies(self):
        return self.total_copies - self.borrowed_count


class BorrowStatus(models.TextChoices):
    BORROWED = 'BORROWED', 'Borrowed'
    RETURNED = 'RETURNED', 'Returned'
    LOST = 'LOST', 'Lost'


class BorrowRecord(models.Model):
    """One student's loan of one book copy."""
    book = models.ForeignKey(Book, on_delete=models.PROTECT, related_name='borrow_records')
    student = models.ForeignKey(
        'students.Student', on_delete=models.CASCADE, related_name='borrow_records'
    )
    borrowed_date = models.DateField(default=timezone.localdate)
    due_date = models.DateField()
    returned_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=BorrowStatus.choices, default=BorrowStatus.BORROWED)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='books_issued'
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-borrowed_date', 'due_date']

    def __str__(self):
        return f'{self.student.full_name} — {self.book.title} ({self.status})'

    @property
    def is_overdue(self):
        return self.status == BorrowStatus.BORROWED and self.due_date < timezone.localdate()
