from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet

from attendance.models import AbsenceAlert

from .models import Message
from .serializers import BroadcastSerializer, MessageSerializer
from .services import NotificationService


class MessageHistoryViewSet(ReadOnlyModelViewSet):
    """GET /api/communications/history/"""
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Message.objects
            .select_related('sent_by')
            .prefetch_related('logs')
            .order_by('-sent_at')
        )


class BroadcastView(APIView):
    """POST /api/communications/broadcast/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = BroadcastSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        message = serializer.save(sent_by=request.user)
        summary = NotificationService.broadcast(message, sent_by_user=request.user)

        return Response(
            {
                'message_id': message.pk,
                'total_recipients': summary['total_recipients'],
                'delivered': summary['delivered'],
                # WhatsApp URLs returned so the frontend can open them
                'wa_urls': summary.get('wa_urls', []),
            },
            status=status.HTTP_201_CREATED,
        )


class FeeReminderView(APIView):
    """
    POST /api/communications/fee-reminders/
    Send a WhatsApp/email fee reminder for one student's oldest outstanding invoice.
    Body: {"student_id": "SHULE-2024-0001"}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from fees.models import Invoice, InvoiceStatus
        from students.models import Student

        student_id = request.data.get('student_id')
        if not student_id:
            return Response({'detail': 'student_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            student = Student.objects.prefetch_related('guardians').get(student_id=student_id)
        except Student.DoesNotExist:
            return Response({'detail': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)

        invoice = (
            Invoice.objects
            .filter(student=student, status__in=[
                InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE
            ])
            .order_by('due_date')
            .first()
        )
        if not invoice:
            return Response(
                {'detail': 'No outstanding invoice for this student.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        result = NotificationService.send_fee_reminder(invoice)
        return Response({
            'success': result.get('success', False),
            'wa_url': result.get('wa_url'),
            'student_id': student_id,
        }, status=status.HTTP_200_OK)


class SendAbsenceAlertsView(APIView):
    """
    POST /api/communications/send-absence-alerts/
    Manually trigger absence alerts for today's unsent AbsenceAlerts.
    Also used as a fallback if the Celery beat task hasn't run.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        today = timezone.localdate()
        alerts = AbsenceAlert.objects.filter(
            date=today, sms_sent=False
        ).select_related('student').prefetch_related('student__guardians')

        sent = 0
        failed = 0
        wa_urls = []

        for alert in alerts:
            result = NotificationService.send_absence_alert(alert.student, today)
            if result.get('success'):
                alert.sms_sent = True
                alert.sent_at = timezone.now()
                alert.save(update_fields=['sms_sent', 'sent_at'])
                sent += 1
                if result.get('wa_url'):
                    wa_urls.append(
                        {
                            'student_id': alert.student.student_id,
                            'student_name': alert.student.full_name,
                            'url': result['wa_url'],
                        }
                    )
            else:
                failed += 1

        return Response(
            {
                'date': str(today),
                'sent': sent,
                'failed': failed,
                'wa_urls': wa_urls,
            }
        )
