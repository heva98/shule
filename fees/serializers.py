from rest_framework import serializers

from .models import (
    AcademicYear,
    FeeStructure,
    Invoice,
    InvoiceLine,
    Payment,
    PaymentAllocation,
    Quarter,
    SchoolCalendarEvent,
    Term,
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
