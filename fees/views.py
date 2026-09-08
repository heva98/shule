from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from accounts.models import Role
from accounts.permissions import ModuleEnabled
from students.models import Student, StudentStatus

from .models import (
    AcademicYear,
    ActivityFeePlan,
    FeeCategory,
    FeeStructure,
    Invoice,
    InvoiceKind,
    InvoiceLine,
    InvoiceStatus,
    LineStatus,
    LunchFeeConfig,
    Payment,
    StudentCredit,
    TuitionFeePlan,
    UniformFeePlan,
)
from .serializers import (
    AcademicYearSerializer,
    ActivityFeePlanSerializer,
    ChargeGenerateSerializer,
    FeeStructureSerializer,
    InvoiceGenerateSerializer,
    InvoiceLineSerializer,
    InvoiceLineWriteSerializer,
    InvoiceSerializer,
    LunchFeeConfigSerializer,
    PaymentSerializer,
    ReceiptSerializer,
    StudentCreditSerializer,
    TuitionFeePlanSerializer,
    UniformAssignSerializer,
    UniformFeePlanSerializer,
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
    module = 'fees'
    serializer_class = FeeStructureSerializer
    permission_classes = [IsAuthenticated, ModuleEnabled]

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


class _FeeConfigViewSet(ModelViewSet):
    """Shared base for the fee-configuration endpoints: finance-only, module
    gated, filterable by ``?year=`` / ``?level=`` / ``?term=`` / ``?active=``."""
    module = 'fees'
    permission_classes = [IsAuthenticated, ModuleEnabled]
    _model = None

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to manage fee configuration.')

    def get_queryset(self):
        qs = self._model.objects.select_related('academic_year')
        p = self.request.query_params
        if p.get('year'):
            qs = qs.filter(academic_year__year=p['year'])
        if p.get('academic_year'):
            qs = qs.filter(academic_year_id=p['academic_year'])
        if p.get('level') and hasattr(self._model, 'level'):
            qs = qs.filter(level=p['level'])
        if p.get('term') and hasattr(self._model, 'term'):
            qs = qs.filter(term=p['term'])
        if p.get('quarter') and hasattr(self._model, 'quarter'):
            qs = qs.filter(quarter=p['quarter'])
        if p.get('active') in ('1', 'true', 'True'):
            qs = qs.filter(is_active=True)
        return qs


class TuitionFeePlanViewSet(_FeeConfigViewSet):
    _model = TuitionFeePlan
    serializer_class = TuitionFeePlanSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('scope'):
            qs = qs.filter(scope=p['scope'])
        if p.get('level_group'):
            qs = qs.filter(level_group=p['level_group'])
        return qs


class UniformFeePlanViewSet(_FeeConfigViewSet):
    _model = UniformFeePlan
    serializer_class = UniformFeePlanSerializer


class LunchFeeConfigViewSet(_FeeConfigViewSet):
    _model = LunchFeeConfig
    serializer_class = LunchFeeConfigSerializer


class ActivityFeePlanViewSet(_FeeConfigViewSet):
    _model = ActivityFeePlan
    serializer_class = ActivityFeePlanSerializer


class FeeConfigResolveView(APIView):
    """Preview what the current configuration would charge one student for a
    period — GET /api/fees/config/resolve/?student=&academic_year=&term=&quarter=

    Read-only; the Phase 3 engine snapshots these onto real charges."""
    module = 'fees'
    permission_classes = [IsAuthenticated, ModuleEnabled]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to view fee configuration.')

    def get(self, request):
        from . import resolvers

        try:
            student = Student.objects.get(pk=request.query_params['student'])
            year = AcademicYear.objects.get(pk=request.query_params['academic_year'])
        except (KeyError, Student.DoesNotExist, AcademicYear.DoesNotExist):
            return Response(
                {'detail': 'student and academic_year are required and must exist.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        term = request.query_params.get('term')
        quarter = request.query_params.get('quarter')

        boarding = resolvers.is_boarding(student, year)
        out = {
            'student': student.pk,
            'student_name': student.full_name,
            'is_boarding': boarding,
            'annual': {
                'TUITION': _money(resolvers.resolve_tuition(student, year)),
                'UNIFORM': _money(resolvers.resolve_uniform(student, year)),
            },
        }
        if term and quarter:
            out['quarterly'] = {
                'LUNCH': _money(resolvers.resolve_lunch(student, year, term, quarter)),
                'TRANSPORT': _money(resolvers.resolve_transport(student, year, term, quarter)),
                'ACTIVITY': _money(resolvers.resolve_activity(student, year, term, quarter)),
            }
        return Response(out)


def _money(value):
    return None if value is None else str(value)


class ChargeGenerateView(APIView):
    """POST /api/fees/charges/generate/ — run the assignment engine for a
    period. Idempotent: safe to re-run for late joiners or after a config
    change. Body: {academic_year, scope: ANNUAL|QUARTERLY, term?, quarter?,
    levels?[], due_date?}."""
    module = 'fees'
    permission_classes = [IsAuthenticated, ModuleEnabled]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to generate charges.')

    def post(self, request):
        from .charges import generate_charges

        s = ChargeGenerateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        result = generate_charges(
            d['academic_year'], d['scope'],
            term=d.get('term'), quarter=d.get('quarter'),
            levels=d.get('levels') or None, due_date=d.get('due_date'),
            created_by=request.user,
        )
        return Response(result, status=status.HTTP_200_OK)


class UniformAssignView(APIView):
    """POST /api/fees/charges/assign-uniform/ — opt students into the uniform
    charge for a year, with an optional per-student amount override."""
    module = 'fees'
    permission_classes = [IsAuthenticated, ModuleEnabled]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to assign uniform.')

    def post(self, request):
        from .charges import assign_uniform

        s = UniformAssignSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        students = Student.objects.filter(pk__in=d['student_ids'])
        result = assign_uniform(
            d['academic_year'], students,
            amount_override=d.get('amount_override'),
            created_by=request.user,
        )
        return Response(result, status=status.HTTP_200_OK)


class StudentFeeSummaryView(APIView):
    """GET /api/fees/student-summary/?student=&academic_year= — the per-category
    required / paid / outstanding table for one student."""
    module = 'fees'
    permission_classes = [IsAuthenticated, ModuleEnabled]

    def check_permissions(self, request):
        super().check_permissions(request)
        role = request.user.role
        if role in _MANAGE_ROLES or role == Role.PARENT:
            return
        raise PermissionDenied('You do not have permission to view fee summaries.')

    def get(self, request):
        from .summaries import student_fee_summary

        try:
            student = Student.objects.get(pk=request.query_params['student'])
            year = AcademicYear.objects.get(pk=request.query_params['academic_year'])
        except (KeyError, Student.DoesNotExist, AcademicYear.DoesNotExist):
            return Response(
                {'detail': 'student and academic_year are required and must exist.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.user.role == Role.PARENT:
            own = student.guardians.filter(phone=request.user.phone)
            if request.user.email:
                own = own | student.guardians.filter(email=request.user.email)
            if not own.exists():
                raise PermissionDenied('Not your child.')

        return Response(student_fee_summary(student, year))


class InvoiceLineViewSet(ModelViewSet):
    """Read + manual charge management. The assignment engine owns generated
    lines; through here staff add one-off charges and void charges (unassign
    uniform, drop a charge for a departed student)."""
    module = 'fees'
    permission_classes = [IsAuthenticated, ModuleEnabled]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to manage charges.')

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return InvoiceLineWriteSerializer
        return InvoiceLineSerializer

    def get_queryset(self):
        qs = InvoiceLine.objects.select_related('invoice__student').prefetch_related('adjustments')
        p = self.request.query_params
        if p.get('student'):
            qs = qs.filter(invoice__student_id=p['student'])
        if p.get('academic_year'):
            qs = qs.filter(invoice__academic_year_id=p['academic_year'])
        if p.get('invoice'):
            qs = qs.filter(invoice_id=p['invoice'])
        if p.get('category'):
            qs = qs.filter(category=p['category'])
        if p.get('kind'):
            qs = qs.filter(invoice__kind=p['kind'])
        if p.get('outstanding') in ('1', 'true', 'True'):
            # lines that still have a balance to receive against
            qs = qs.filter(status__in=[LineStatus.UNPAID, LineStatus.PARTIAL])
        return qs

    def _guard_mutable(self, line):
        if line.is_legacy:
            raise ValidationError('Legacy lines cannot be edited.')
        if line.amount_allocated > 0:
            raise ValidationError('This charge already has payments and cannot be edited.')
        if line.status == 'VOID':
            raise ValidationError('This charge is already void.')

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, source_kind='manual')

    def perform_update(self, serializer):
        self._guard_mutable(serializer.instance)
        serializer.save()

    @action(detail=True, methods=['post'], url_path='void')
    def void(self, request, pk=None):
        from .services import void_line

        line = self.get_object()
        if line.is_legacy:
            return Response({'detail': 'Legacy lines cannot be voided.'},
                            status=status.HTTP_400_BAD_REQUEST)
        void_line(line, request.user, (request.data.get('reason') or '').strip())
        return Response(InvoiceLineSerializer(line).data)


class InvoiceViewSet(ModelViewSet):
    module = 'fees'
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated, ModuleEnabled]

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
            invoice, was_created = Invoice.objects.get_or_create(
                student=student,
                academic_year=academic_year,
                term=term,
                quarter=quarter,
                kind=InvoiceKind.QUARTERLY,
                defaults={'amount_due': amount_due, 'due_date': due_date},
            )
            # Phase 1 bridge: the per-category resolver arrives in Phase 3.
            # Until then each generated invoice carries one consolidated line so
            # the pay / receipt / balance flow keeps working end to end.
            InvoiceLine.objects.get_or_create(
                invoice=invoice,
                category=FeeCategory.TUITION,
                defaults={
                    'amount': amount_due,
                    'description': 'Consolidated term fees',
                    'level_snapshot': student.level,
                    'source_kind': 'legacy_generate',
                },
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
    module = 'fees'
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated, ModuleEnabled]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to access payments.')

    def get_queryset(self):
        qs = (
            Payment.objects
            .select_related('invoice__student', 'student', 'received_by')
            .prefetch_related('allocations__invoice_line')
        )
        p = self.request.query_params
        if p.get('student'):
            qs = qs.filter(student_id=p['student'])
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('academic_year'):
            qs = qs.filter(
                Q(invoice__academic_year_id=p['academic_year'])
                | Q(allocations__invoice_line__invoice__academic_year_id=p['academic_year'])
            ).distinct()
        return qs

    @transaction.atomic
    def perform_create(self, serializer):
        from .services import allocate_payment, apply_credit, auto_allocate

        allocations_input = serializer.validated_data.pop('allocations_input', None)
        invoice = serializer.validated_data.get('invoice')
        credit = serializer.validated_data.get('funded_from_credit')
        student = serializer.validated_data.get('student') or (
            invoice.student if invoice else None
        )
        if student is None:
            raise ValidationError('Could not determine the student for this payment.')
        if credit and credit.student_id != student.id:
            raise ValidationError('That credit belongs to a different student.')

        payment = serializer.save(received_by=self.request.user, student=student)

        if allocations_input:
            allocate_payment(
                payment,
                [(row['invoice_line'], row['amount']) for row in allocations_input],
            )
        else:
            auto_allocate(payment, invoice)

        if credit:
            apply_credit(credit, payment)

    @action(detail=True, methods=['get'], url_path='receipt')
    def receipt(self, request, pk=None):
        payment = self.get_object()
        return Response(ReceiptSerializer(payment).data)

    @action(detail=True, methods=['post'], url_path='reverse')
    def reverse_payment(self, request, pk=None):
        from .services import reverse_payment

        payment = self.get_object()
        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response({'detail': 'A reason is required.'}, status=status.HTTP_400_BAD_REQUEST)
        reverse_payment(payment, request.user, reason)
        return Response(ReceiptSerializer(payment).data)


class StudentCreditViewSet(ReadOnlyModelViewSet):
    """Carried credit a student can be paid from. Read-only — credits are only
    created by voiding a paid charge or reversing a payment."""
    module = 'fees'
    serializer_class = StudentCreditSerializer
    permission_classes = [IsAuthenticated, ModuleEnabled]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to view credits.')

    def get_queryset(self):
        qs = StudentCredit.objects.select_related('student').order_by('-created_at')
        p = self.request.query_params
        if p.get('student'):
            qs = qs.filter(student_id=p['student'])
        if p.get('available') in ('1', 'true', 'True'):
            qs = qs.filter(remaining_amount__gt=0)
        return qs


def defaulters_queryset(term=None, level=None):
    """Base queryset for outstanding invoices, shared by DefaultersView and
    the combined dashboard-summary endpoint so both stay in sync."""
    qs = Invoice.objects.filter(
        status__in=[InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE]
    ).select_related('student')
    if term:
        qs = qs.filter(term=term)
    if level:
        qs = qs.filter(student__level=level)
    return qs.order_by('student__last_name')


def serialize_defaulter(inv):
    return {
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


def monthly_revenue_data(year):
    """List of {month, collected} for the given year, shared by
    FeeMonthlyView and the combined dashboard-summary endpoint."""
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
    return [
        {'month': MONTHS[row['m'].month - 1], 'collected': str(row['total'])}
        for row in rows
    ]


def fee_summary_data(term=None, year=None):
    """total_invoiced/collected/outstanding + collection rate, shared by
    FeeSummaryView and the combined dashboard-summary endpoint."""
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
    return {
        'total_invoiced': str(total_invoiced),
        'total_collected': str(total_collected),
        'total_outstanding': str(total_outstanding),
        'collection_rate_percent': str(collection_rate),
    }


class _DefaultersPagination(PageNumberPagination):
    page_size = 20
    # Keep the existing `?limit=N` contract callers already use
    # (DashboardPage's "top 5 defaulters" widget) while adding real
    # page-based pagination instead of loading the whole table.
    page_size_query_param = 'limit'
    max_page_size = 200


class DefaultersView(APIView):
    module = 'fees'
    permission_classes = [IsAuthenticated, ModuleEnabled]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to view defaulters.')

    def get(self, request):
        term = request.query_params.get('term')
        level = request.query_params.get('level')

        # Overdue status is flipped by the hourly fees.tasks.flip_overdue_invoices
        # beat task, not here — this used to run that UPDATE inline on every GET,
        # turning a read endpoint into a full-table write on every dashboard load.
        qs = defaulters_queryset(term=term, level=level)
        paginator = _DefaultersPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        data = [serialize_defaulter(inv) for inv in page]
        return paginator.get_paginated_response(data)


class FeeMonthlyView(APIView):
    """GET /api/fees/summary/monthly/?year=YYYY — revenue bar chart data."""
    module = 'fees'
    permission_classes = [IsAuthenticated, ModuleEnabled]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to view fee summaries.')

    def get(self, request):
        year = request.query_params.get('year') or timezone.now().year
        return Response(monthly_revenue_data(year))


class FeeSummaryView(APIView):
    module = 'fees'
    permission_classes = [IsAuthenticated, ModuleEnabled]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to view fee summaries.')

    def get(self, request):
        term = request.query_params.get('term')
        year = request.query_params.get('year')
        return Response(fee_summary_data(term=term, year=year))
