from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from accounts.models import Role
from students.models import Student, StudentStatus

from .models import AcademicYear, FeeStructure, Invoice, InvoiceStatus, Payment
from .serializers import (
    AcademicYearSerializer,
    FeeStructureSerializer,
    InvoiceGenerateSerializer,
    InvoiceSerializer,
    PaymentSerializer,
    ReceiptSerializer,
)

# Roles that may manage fee structures, invoices and payments (matches the
# frontend's FEATURE_ROLES.FEES — nothing here has a legitimate non-finance
# use case except a parent viewing their own child's invoices, handled below).
_MANAGE_ROLES = {Role.OWNER, Role.HEADTEACHER, Role.BURSAR}


class AcademicYearViewSet(ModelViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer
    permission_classes = [IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        # Read is left open — many other apps (timetable, exams, boarding...)
        # need academic years for their own forms.
        if self.action in ('create', 'update', 'partial_update', 'destroy') and request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to manage academic years.')


class FeeStructureViewSet(ModelViewSet):
    serializer_class = FeeStructureSerializer
    permission_classes = [IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to access fee structures.')

    def get_queryset(self):
        qs = FeeStructure.objects.select_related('academic_year').all()
        level = self.request.query_params.get('level')
        year = self.request.query_params.get('year')
        if level:
            qs = qs.filter(level=level)
        if year:
            qs = qs.filter(academic_year__year=year)
        return qs


class InvoiceViewSet(ModelViewSet):
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        role = request.user.role
        if role in _MANAGE_ROLES:
            return
        # Parents may only ever read (their own children's invoices are
        # enforced in get_queryset below) — never create/edit/delete.
        if role == Role.PARENT and self.action in ('list', 'retrieve'):
            return
        raise PermissionDenied('You do not have permission to access invoices.')

    def get_queryset(self):
        qs = (
            Invoice.objects
            .select_related('student', 'academic_year')
            .prefetch_related('payments')
        )
        user = self.request.user
        if user.role == Role.PARENT:
            # A parent may only ever see invoices for their own children,
            # regardless of what ?student= is passed.
            child_filter = Q(student__guardians__phone=user.phone)
            if user.email:
                child_filter |= Q(student__guardians__email=user.email)
            qs = qs.filter(child_filter).distinct()

        student = self.request.query_params.get('student')
        term = self.request.query_params.get('term')
        inv_status = self.request.query_params.get('status')
        level = self.request.query_params.get('level')
        if student:
            qs = qs.filter(student__pk=student)
        if term:
            qs = qs.filter(term=term)
        if inv_status:
            qs = qs.filter(status=inv_status)
        if level:
            qs = qs.filter(student__level=level)
        return qs

    @action(detail=False, methods=['post'], url_path='generate')
    @transaction.atomic
    def generate(self, request):
        serializer = InvoiceGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        academic_year = data['academic_year']
        term = data['term']
        quarter = data['quarter']
        level = data['level']
        due_date = data['due_date']

        try:
            structure = FeeStructure.objects.get(
                academic_year=academic_year, level=level, term=term, quarter=quarter
            )
        except FeeStructure.DoesNotExist:
            return Response(
                {'detail': f'No fee structure found for {level} / {term} / {quarter} / {academic_year}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        students = Student.objects.filter(level=level, status=StudentStatus.ACTIVE)
        if not students.exists():
            return Response(
                {'detail': f'No active students found at level {level}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount_due = structure.total_fee
        created, skipped = 0, 0
        for student in students:
            _, was_created = Invoice.objects.get_or_create(
                student=student,
                academic_year=academic_year,
                term=term,
                quarter=quarter,
                defaults={'amount_due': amount_due, 'due_date': due_date},
            )
            if was_created:
                created += 1
            else:
                skipped += 1

        return Response(
            {
                'detail': f'{created} invoices created, {skipped} already existed.',
                'created': created,
                'skipped': skipped,
                'amount_due': str(amount_due),
            },
            status=status.HTTP_201_CREATED,
        )


class PaymentViewSet(ModelViewSet):
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to access payments.')

    def get_queryset(self):
        return Payment.objects.select_related('invoice__student', 'received_by').all()

    def perform_create(self, serializer):
        serializer.save(received_by=self.request.user)

    @action(detail=True, methods=['get'], url_path='receipt')
    def receipt(self, request, pk=None):
        payment = self.get_object()
        return Response(ReceiptSerializer(payment).data)


class _DefaultersPagination(PageNumberPagination):
    page_size = 20
    # Keep the existing `?limit=N` contract callers already use
    # (DashboardPage's "top 5 defaulters" widget) while adding real
    # page-based pagination instead of loading the whole table.
    page_size_query_param = 'limit'
    max_page_size = 200


class DefaultersView(APIView):
    permission_classes = [IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to view defaulters.')

    def get(self, request):
        term = request.query_params.get('term')
        level = request.query_params.get('level')

        qs = Invoice.objects.filter(
            status__in=[InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE]
        ).select_related('student')

        if term:
            qs = qs.filter(term=term)
        if level:
            qs = qs.filter(student__level=level)

        # Flip invoices past their due date to OVERDUE in one UPDATE —
        # `status__in` above already excludes PAID, so no extra exclude needed.
        today = timezone.now().date()
        qs.filter(due_date__lt=today).exclude(status=InvoiceStatus.OVERDUE).update(
            status=InvoiceStatus.OVERDUE
        )

        qs = qs.order_by('student__last_name')
        paginator = _DefaultersPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        data = [
            {
                'student_id': inv.student.student_id,
                'student_name': inv.student.full_name,
                'level': inv.student.level,
                'term': inv.term,
                'quarter': inv.quarter,
                'amount_due': str(inv.amount_due),
                'amount_paid': str(inv.amount_paid),
                'balance': str(inv.balance),
                'due_date': str(inv.due_date),
                'status': inv.status,
            }
            for inv in page
        ]
        return paginator.get_paginated_response(data)


class FeeMonthlyView(APIView):
    """GET /api/fees/summary/monthly/?year=YYYY — revenue bar chart data."""
    permission_classes = [IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to view fee summaries.')

    def get(self, request):
        year = request.query_params.get('year') or timezone.now().year
        MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        rows = (
            Payment.objects
            .filter(paid_at__year=year)
            .annotate(m=TruncMonth('paid_at'))
            .values('m')
            .annotate(total=Sum('amount'))
            .order_by('m')
        )
        return Response([
            {'month': MONTHS[row['m'].month - 1], 'collected': str(row['total'])}
            for row in rows
        ])


class FeeSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to view fee summaries.')

    def get(self, request):
        term = request.query_params.get('term')
        year = request.query_params.get('year')

        qs = Invoice.objects.all()
        if term == 'current':
            try:
                current_year = AcademicYear.objects.get(is_current=True)
                qs = qs.filter(academic_year=current_year)
            except AcademicYear.DoesNotExist:
                pass
        elif term:
            qs = qs.filter(term=term)
        if year:
            qs = qs.filter(academic_year__year=year)

        agg = qs.aggregate(
            total_invoiced=Sum('amount_due'),
            total_collected=Sum('amount_paid'),
        )
        total_invoiced = agg['total_invoiced'] or Decimal('0')
        total_collected = agg['total_collected'] or Decimal('0')
        total_outstanding = total_invoiced - total_collected
        collection_rate = (
            round((total_collected / total_invoiced) * 100, 2)
            if total_invoiced > 0
            else Decimal('0')
        )

        return Response(
            {
                'total_invoiced': str(total_invoiced),
                'total_collected': str(total_collected),
                'total_outstanding': str(total_outstanding),
                'collection_rate_percent': str(collection_rate),
            }
        )
