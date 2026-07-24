from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.models import Role

from .models import Book, BorrowRecord, BorrowStatus
from .serializers import BookSerializer, BorrowRecordSerializer

# Roles that may manage the catalog and issue/return books
_MANAGE_ROLES = {Role.OWNER, Role.HEADTEACHER, Role.LIBRARIAN}


class BookViewSet(ModelViewSet):
    serializer_class = BookSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Book.objects.all()
        p = self.request.query_params
        if p.get('search'):
            s = p['search']
            qs = qs.filter(title__icontains=s) | qs.filter(author__icontains=s) | qs.filter(isbn__icontains=s)
        if p.get('category'):
            qs = qs.filter(category__iexact=p['category'])
        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action in ('create', 'update', 'partial_update', 'destroy') and request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to manage the library catalog.')


class BorrowRecordViewSet(ModelViewSet):
    """
    CRUD for book loans.
    Filter with ?book=&student=&status=&overdue=true
    """
    serializer_class = BorrowRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = BorrowRecord.objects.select_related('book', 'student', 'issued_by')
        p = self.request.query_params
        if p.get('book'):
            qs = qs.filter(book_id=p['book'])
        if p.get('student'):
            qs = qs.filter(student_id=p['student'])
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('overdue') == 'true':
            qs = qs.filter(status=BorrowStatus.BORROWED, due_date__lt=timezone.localdate())
        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action in ('create', 'update', 'partial_update', 'destroy') and request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to manage book loans.')

    def perform_create(self, serializer):
        book = serializer.validated_data['book']
        with transaction.atomic():
            # Lock the book row so two concurrent requests for the last copy
            # can't both pass the availability check before either one commits.
            locked_book = Book.objects.select_for_update().get(pk=book.pk)
            borrowed_count = locked_book.borrow_records.filter(status=BorrowStatus.BORROWED).count()
            if borrowed_count >= locked_book.total_copies:
                raise ValidationError({
                    'book': f'"{locked_book.title}" has no available copies right now.'
                })
            serializer.save(issued_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='return')
    def return_book(self, request, pk=None):
        record = self.get_object()
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to manage book loans.')
        if record.status != BorrowStatus.BORROWED:
            return Response({'detail': f'This book is already marked {record.status.lower()}.'}, status=status.HTTP_400_BAD_REQUEST)
        record.status = BorrowStatus.RETURNED
        record.returned_date = timezone.localdate()
        record.save(update_fields=['status', 'returned_date'])
        return Response(BorrowRecordSerializer(record).data)

    @action(detail=True, methods=['post'], url_path='mark-lost')
    def mark_lost(self, request, pk=None):
        record = self.get_object()
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to manage book loans.')
        if record.status != BorrowStatus.BORROWED:
            return Response({'detail': f'This book is already marked {record.status.lower()}.'}, status=status.HTTP_400_BAD_REQUEST)
        record.status = BorrowStatus.LOST
        record.save(update_fields=['status'])
        return Response(BorrowRecordSerializer(record).data)
