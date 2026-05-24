from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

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


class AcademicYearViewSet(ModelViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer
    permission_classes = [IsAuthenticated]


class FeeStructureViewSet(ModelViewSet):
    serializer_class = FeeStructureSerializer
    permission_classes = [IsAuthenticated]

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

    def get_queryset(self):
        qs = (
            Invoice.objects
            .select_related('student', 'academic_year')
            .prefetch_related('payments')
        )
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

    def get_queryset(self):
        return Payment.objects.select_related('invoice__student', 'received_by').all()

    def perform_create(self, serializer):
        serializer.save(received_by=self.request.user)

    @action(detail=True, methods=['get'], url_path='receipt')
    def receipt(self, request, pk=None):
        payment = self.get_object()
        return Response(ReceiptSerializer(payment).data)


class DefaultersView(APIView):
    permission_classes = [IsAuthenticated]

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

        # Mark overdue invoices whose due_date has passed
        today = timezone.now().date()
        overdue_ids = [
            inv.pk for inv in qs
            if inv.due_date < today and inv.status != InvoiceStatus.PAID
        ]
        if overdue_ids:
            Invoice.objects.filter(pk__in=overdue_ids).update(status=InvoiceStatus.OVERDUE)
            qs = qs.all()  # re-evaluate after update

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
            for inv in qs.order_by('student__last_name')
        ]
        limit = request.query_params.get('limit')
        if limit:
            try:
                data = data[:int(limit)]
            except (ValueError, TypeError):
                pass
        return Response(data)


class FeeMonthlyView(APIView):
    """GET /api/fees/summary/monthly/?year=YYYY — revenue bar chart data."""
    permission_classes = [IsAuthenticated]

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
