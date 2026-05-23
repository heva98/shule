from rest_framework import serializers

from .models import AcademicYear, FeeStructure, Invoice, Payment


class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicYear
        fields = '__all__'


class FeeStructureSerializer(serializers.ModelSerializer):
    total_fee = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model = FeeStructure
        fields = [
            'id', 'academic_year', 'level', 'term',
            'tuition_fee', 'lunch_fee', 'transport_fee',
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

    class Meta:
        model = Invoice
        fields = [
            'id', 'student', 'student_id_display', 'student_name',
            'academic_year', 'term',
            'amount_due', 'amount_paid', 'balance',
            'due_date', 'status', 'notes',
            'payments', 'created_at',
        ]
        read_only_fields = ['id', 'amount_paid', 'status', 'created_at']


class InvoiceGenerateSerializer(serializers.Serializer):
    academic_year = serializers.PrimaryKeyRelatedField(
        queryset=AcademicYear.objects.all()
    )
    term = serializers.ChoiceField(choices=[('TERM1', 'Term 1'), ('TERM2', 'Term 2'), ('TERM3', 'Term 3')])
    level = serializers.CharField(max_length=10)
    due_date = serializers.DateField()


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
