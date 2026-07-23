from rest_framework import serializers

from .models import Book, BorrowRecord


class BookSerializer(serializers.ModelSerializer):
    borrowed_count = serializers.IntegerField(read_only=True)
    available_copies = serializers.IntegerField(read_only=True)

    class Meta:
        model = Book
        fields = [
            'id', 'title', 'author', 'isbn', 'category', 'publisher',
            'publication_year', 'shelf_location', 'total_copies', 'notes',
            'borrowed_count', 'available_copies',
        ]


class BorrowRecordSerializer(serializers.ModelSerializer):
    book_title = serializers.CharField(source='book.title', read_only=True)
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_id_no = serializers.CharField(source='student.student_id', read_only=True)
    issued_by_name = serializers.CharField(source='issued_by.full_name', read_only=True, default=None)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = BorrowRecord
        fields = [
            'id', 'book', 'book_title', 'student', 'student_name', 'student_id_no',
            'borrowed_date', 'due_date', 'returned_date', 'status', 'is_overdue',
            'issued_by', 'issued_by_name', 'notes', 'created_at',
        ]
        read_only_fields = ['id', 'returned_date', 'status', 'issued_by', 'created_at']

    def validate(self, attrs):
        book = attrs.get('book', getattr(self.instance, 'book', None))
        if book and not self.instance:
            if book.available_copies <= 0:
                raise serializers.ValidationError({
                    'book': f'"{book.title}" has no available copies right now.'
                })
        return attrs
