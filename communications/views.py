from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet

from attendance.models import AbsenceAlert

from .models import Audience, Message
from .serializers import BroadcastSerializer, DemoRequestSerializer, MessageSerializer
from .services import NotificationService


class DemoRequestView(APIView):
    """
    POST /api/communications/demo-requests/
    Public endpoint — a visitor on the marketing landing page asking to be shown the system.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = DemoRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {'detail': 'Thanks — we will be in touch shortly.'},
            status=status.HTTP_201_CREATED,
        )


class AnnouncementsView(APIView):
    """
    GET /api/communications/announcements/?level=FORM1
    School-wide and level broadcasts visible to parents.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        level = request.query_params.get('level')
        qs = Message.objects.filter(audience__in=[Audience.SCHOOL, Audience.LEVEL])
        if level:
            qs = qs.filter(Q(audience=Audience.SCHOOL) | Q(target_level=level))
        qs = qs.select_related('sent_by').order_by('-sent_at')[:50]
        data = [
            {
                'id': m.pk,
                'subject': m.subject,
                'body': m.body,
                'audience': m.audience,
                'target_level': m.target_level,
                'sent_at': m.sent_at.isoformat(),
                'sent_by_name': m.sent_by.full_name if m.sent_by else '',
            }
            for m in qs
        ]
        return Response(data)


class MessageHistoryViewSet(ReadOnlyModelViewSet):
    """GET /api/communications/history/"""
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Message.objects.select_related('sent_by').prefetch_related('logs').order_by('-sent_at')
        p = self.request.query_params
        if p.get('channel'):
            qs = qs.filter(message_type=p['channel'])
        if p.get('date_from'):
            qs = qs.filter(sent_at__date__gte=p['date_from'])
        if p.get('date_to'):
            qs = qs.filter(sent_at__date__lte=p['date_to'])
        return qs


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


class BulkFeeReminderView(APIView):
    """
    POST /api/communications/bulk-fee-reminders/
    Send one fee reminder per student who has any outstanding invoice.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from fees.models import Invoice, InvoiceStatus

        invoices = (
            Invoice.objects
            .filter(status__in=[InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE])
            .select_related('student')
            .prefetch_related('student__guardians')
            .order_by('student_id', 'due_date')  # oldest invoice first per student
        )

        seen_students: set = set()
        sent = 0
        failed = 0

        for invoice in invoices:
            if invoice.student_id in seen_students:
                continue  # one reminder per student
            seen_students.add(invoice.student_id)

            result = NotificationService.send_fee_reminder(invoice)
            if result.get('success'):
                sent += 1
            else:
                failed += 1

        return Response({
            'total_students': len(seen_students),
            'sent': sent,
            'failed': failed,
        })


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
