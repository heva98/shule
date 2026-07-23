from django.contrib import admin

from .models import Book, BorrowRecord


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ('title', 'author', 'category', 'total_copies', 'borrowed_count', 'shelf_location')
    list_filter = ('category',)
    search_fields = ('title', 'author', 'isbn')
    ordering = ('title',)


@admin.register(BorrowRecord)
class BorrowRecordAdmin(admin.ModelAdmin):
    list_display = ('student', 'book', 'borrowed_date', 'due_date', 'returned_date', 'status', 'is_overdue')
    list_filter = ('status', 'due_date')
    search_fields = ('student__first_name', 'student__last_name', 'student__student_id', 'book__title')
    ordering = ('-borrowed_date',)
