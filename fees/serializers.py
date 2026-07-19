from rest_framework import serializers

from .models import AcademicYear, FeeStructure, Invoice, Payment, Quarter, SchoolCalendarEvent, Term


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
        fields = ['id', 'amount', 'payment_method', 'transaction_id', 'paid_at', 'receipt_number']


class InvoiceSerializer(serializers.ModelSerializer):
    balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    payments = PaymentInlineSerializer(many=True, read_only=True)
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_id_display = serializers.CharField(source='student.student_id', read_only=True)
    student_level = serializers.CharField(source='student.level', read_only=True)
    academic_year_label = serializers.CharField(source='academic_year.year', read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'student', 'student_id_display', 'student_name', 'student_level',
            'academic_year', 'academic_year_label', 'term', 'quarter',
            'amount_due', 'amount_paid', 'balance',
            'due_date', 'status', 'notes',
            'payments', 'created_at',
        ]
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


class PaymentSerializer(serializers.ModelSerializer):
    receipt_number = serializers.CharField(read_only=True)

    class Meta:
        model = Payment
        fields = [
            'id', 'invoice', 'amount', 'payment_method',
            'transaction_id', 'phone_used', 'paid_at',
            'received_by', 'receipt_number', 'notes',
        ]
        read_only_fields = ['id', 'receipt_number']

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Payment amount must be greater than zero.')
        return value


class ReceiptSerializer(serializers.ModelSerializer):
    invoice_detail = InvoiceSerializer(source='invoice', read_only=True)
    received_by_name = serializers.CharField(source='received_by.full_name', read_only=True)

    class Meta:
        model = Payment
        fields = [
            'id', 'receipt_number', 'amount', 'payment_method',
            'transaction_id', 'phone_used', 'paid_at',
            'received_by', 'received_by_name', 'notes',
            'invoice_detail',
        ]
