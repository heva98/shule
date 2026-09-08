from rest_framework import serializers

from .models import (
    AcademicYear,
    ActivityFeePlan,
    FeeStructure,
    Invoice,
    InvoiceLine,
    LunchFeeConfig,
    Payment,
    PaymentAllocation,
    Quarter,
    SchoolCalendarEvent,
    Term,
    TuitionFeePlan,
    UniformFeePlan,
)


class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicYear
        fields = '__all__'


class SchoolCalendarEventSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)

    class Meta:
        model = SchoolCalendarEvent
        fields = [
            'id', 'academic_year', 'title', 'event_type',
            'start_date', 'end_date', 'description',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def validate(self, attrs):
        start = attrs.get('start_date')
        end   = attrs.get('end_date')
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'End date cannot be before start date.'})
        return attrs


class FeeStructureSerializer(serializers.ModelSerializer):
    total_fee = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    period_label = serializers.CharField(read_only=True)
    academic_year_label = serializers.CharField(source='academic_year.year', read_only=True)

    class Meta:
        model = FeeStructure
        fields = [
            'id', 'academic_year', 'academic_year_label', 'level', 'term', 'quarter',
            'period_label', 'tuition_fee', 'lunch_fee', 'transport_fee',
            'uniform_fee', 'activity_fee', 'total_fee',
        ]


class PaymentInlineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ['id', 'amount', 'payment_method', 'transaction_id', 'paid_at',
                  'receipt_number', 'status']


class InvoiceLineSerializer(serializers.ModelSerializer):
    net_required = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    outstanding = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = InvoiceLine
        fields = [
            'id', 'invoice', 'category', 'category_display', 'description',
            'level_snapshot', 'amount', 'amount_allocated', 'net_required',
            'outstanding', 'status', 'is_legacy', 'is_sale', 'created_at',
        ]
        read_only_fields = fields


class InvoiceSerializer(serializers.ModelSerializer):
    balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    payments = PaymentInlineSerializer(many=True, read_only=True)
    lines = InvoiceLineSerializer(many=True, read_only=True)
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_id_display = serializers.CharField(source='student.student_id', read_only=True)
    student_level = serializers.CharField(source='student.level', read_only=True)
    academic_year_label = serializers.CharField(source='academic_year.year', read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'student', 'student_id_display', 'student_name', 'student_level',
            'academic_year', 'academic_year_label', 'kind', 'term', 'quarter',
            'amount_due', 'amount_paid', 'balance',
            'due_date', 'status', 'notes',
            'lines', 'payments', 'created_at',
        ]
        # amount_due stays writable for the legacy "create invoice by hand"
        # path; once the invoice has lines, recompute_invoice owns it.
        read_only_fields = ['id', 'amount_paid', 'status', 'created_at']


class InvoiceGenerateSerializer(serializers.Serializer):
    academic_year = serializers.PrimaryKeyRelatedField(
        queryset=AcademicYear.objects.all()
    )
    term = serializers.ChoiceField(choices=Term.choices)
    quarter = serializers.ChoiceField(choices=Quarter.choices)
    level = serializers.CharField(max_length=10)
    due_date = serializers.DateField()

    def validate(self, attrs):
        from shule.utils import validate_term_quarter
        try:
            validate_term_quarter(attrs['term'], attrs['quarter'])
        except Exception as e:
            raise serializers.ValidationError({'quarter': str(e)})
        return attrs


class PaymentAllocationInputSerializer(serializers.Serializer):
    invoice_line = serializers.PrimaryKeyRelatedField(queryset=InvoiceLine.objects.all())
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)


class PaymentAllocationSerializer(serializers.ModelSerializer):
    category = serializers.CharField(source='invoice_line.category', read_only=True)
    category_display = serializers.CharField(
        source='invoice_line.get_category_display', read_only=True
    )

    class Meta:
        model = PaymentAllocation
        fields = ['id', 'invoice_line', 'category', 'category_display', 'amount']
        read_only_fields = fields


class PaymentSerializer(serializers.ModelSerializer):
    receipt_number = serializers.CharField(read_only=True)
    allocations = PaymentAllocationSerializer(many=True, read_only=True)
    # Optional multi-category split (decision J-9); when omitted the payment is
    # auto-distributed across the given invoice's open lines (legacy path).
    allocations_input = PaymentAllocationInputSerializer(
        many=True, write_only=True, required=False
    )

    class Meta:
        model = Payment
        fields = [
            'id', 'student', 'invoice', 'amount', 'payment_method',
            'transaction_id', 'phone_used', 'paid_at',
            'received_by', 'receipt_number', 'notes', 'status',
            'allocations', 'allocations_input',
        ]
        read_only_fields = ['id', 'received_by', 'receipt_number', 'status']

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Payment amount must be greater than zero.')
        return value

    def validate(self, attrs):
        if not attrs.get('invoice') and not attrs.get('allocations_input'):
            raise serializers.ValidationError(
                'Provide an invoice (legacy auto-split) or an explicit allocations_input list.'
            )
        return attrs


class ReceiptSerializer(serializers.ModelSerializer):
    invoice_detail = InvoiceSerializer(source='invoice', read_only=True)
    allocations = PaymentAllocationSerializer(many=True, read_only=True)
    received_by_name = serializers.CharField(source='received_by.full_name', read_only=True)
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_id_display = serializers.CharField(source='student.student_id', read_only=True)

    class Meta:
        model = Payment
        fields = [
            'id', 'receipt_number', 'amount', 'payment_method',
            'transaction_id', 'phone_used', 'paid_at', 'status',
            'received_by', 'received_by_name',
            'student_name', 'student_id_display', 'notes',
            'allocations', 'invoice_detail',
        ]


# ── Fee configuration ───────────────────────────────────────────────────────

def _reject_duplicate_active_plan(serializer, model, lookup: dict):
    """DRF's auto-generated validators for *conditional* UniqueConstraints
    crash on PATCH (KeyError on the condition field), so we disable those and
    check the "one active plan" rule here with a friendly message."""
    qs = model.objects.filter(is_active=True, **lookup)
    if serializer.instance:
        qs = qs.exclude(pk=serializer.instance.pk)
    if qs.exists():
        raise serializers.ValidationError(
            'An active plan already exists for this scope. Deactivate it first.'
        )


class TuitionFeePlanSerializer(serializers.ModelSerializer):
    academic_year_label = serializers.CharField(source='academic_year.year', read_only=True)
    level_display = serializers.CharField(source='get_level_display', read_only=True)
    level_group_display = serializers.CharField(source='get_level_group_display', read_only=True)
    # Explicit so the auto unique-constraint validators always see them, and so
    # a level-group plan need not send an empty `level`.
    is_active = serializers.BooleanField(required=False, default=True)
    level = serializers.CharField(required=False, allow_blank=True, default='')
    level_group = serializers.CharField(required=False, allow_blank=True, default='')

    class Meta:
        model = TuitionFeePlan
        fields = [
            'id', 'academic_year', 'academic_year_label', 'scope',
            'level_group', 'level_group_display', 'level', 'level_display',
            'amount', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        validators = []  # conditional UniqueConstraints handled in validate()

    def validate(self, attrs):
        inst = self.instance
        scope = attrs.get('scope', getattr(inst, 'scope', None))
        level_group = attrs.get('level_group', getattr(inst, 'level_group', ''))
        level = attrs.get('level', getattr(inst, 'level', ''))
        academic_year = attrs.get('academic_year', getattr(inst, 'academic_year', None))
        is_active = attrs.get('is_active', getattr(inst, 'is_active', True))

        if scope == TuitionFeePlan.Scope.LEVEL_GROUP:
            if not level_group:
                raise serializers.ValidationError({'level_group': 'Required for a level-group plan.'})
            attrs['level'] = level = ''
        elif scope == TuitionFeePlan.Scope.LEVEL:
            if not level:
                raise serializers.ValidationError({'level': 'Required for a single-class plan.'})

        if is_active and academic_year:
            key = {'academic_year': academic_year, 'scope': scope}
            key['level_group' if scope == TuitionFeePlan.Scope.LEVEL_GROUP else 'level'] = (
                level_group if scope == TuitionFeePlan.Scope.LEVEL_GROUP else level
            )
            _reject_duplicate_active_plan(self, TuitionFeePlan, key)
        return attrs


class UniformFeePlanSerializer(serializers.ModelSerializer):
    academic_year_label = serializers.CharField(source='academic_year.year', read_only=True)
    level_display = serializers.CharField(source='get_level_display', read_only=True)
    is_active = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = UniformFeePlan
        fields = [
            'id', 'academic_year', 'academic_year_label', 'level', 'level_display',
            'amount', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        validators = []

    def validate(self, attrs):
        inst = self.instance
        is_active = attrs.get('is_active', getattr(inst, 'is_active', True))
        academic_year = attrs.get('academic_year', getattr(inst, 'academic_year', None))
        level = attrs.get('level', getattr(inst, 'level', None))
        if is_active and academic_year and level:
            _reject_duplicate_active_plan(
                self, UniformFeePlan,
                {'academic_year': academic_year, 'level': level},
            )
        return attrs


class LunchFeeConfigSerializer(serializers.ModelSerializer):
    academic_year_label = serializers.CharField(source='academic_year.year', read_only=True)

    class Meta:
        model = LunchFeeConfig
        fields = [
            'id', 'academic_year', 'academic_year_label', 'term', 'quarter',
            'day_amount', 'boarding_amount', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, attrs):
        from shule.utils import validate_term_quarter
        term = attrs.get('term', getattr(self.instance, 'term', None))
        quarter = attrs.get('quarter', getattr(self.instance, 'quarter', None))
        try:
            validate_term_quarter(term, quarter)
        except Exception as e:
            raise serializers.ValidationError({'quarter': str(e)})
        return attrs


class ActivityFeePlanSerializer(serializers.ModelSerializer):
    academic_year_label = serializers.CharField(source='academic_year.year', read_only=True)
    level_display = serializers.CharField(source='get_level_display', read_only=True)
    is_active = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = ActivityFeePlan
        fields = [
            'id', 'academic_year', 'academic_year_label', 'term', 'quarter',
            'level', 'level_display', 'amount', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        validators = []

    def validate(self, attrs):
        from shule.utils import validate_term_quarter
        inst = self.instance
        term = attrs.get('term', getattr(inst, 'term', None))
        quarter = attrs.get('quarter', getattr(inst, 'quarter', None))
        try:
            validate_term_quarter(term, quarter)
        except Exception as e:
            raise serializers.ValidationError({'quarter': str(e)})

        is_active = attrs.get('is_active', getattr(inst, 'is_active', True))
        academic_year = attrs.get('academic_year', getattr(inst, 'academic_year', None))
        level = attrs.get('level', getattr(inst, 'level', None))
        if is_active and academic_year and level and term and quarter:
            _reject_duplicate_active_plan(
                self, ActivityFeePlan,
                {'academic_year': academic_year, 'term': term,
                 'quarter': quarter, 'level': level},
            )
        return attrs
