from decimal import Decimal

from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet

from .models import AttendanceRecord, AttendanceStatus
from .serializers import (
    AttendanceRecordSerializer,
    BulkAttendanceSerializer,
)


class AttendanceViewSet(ReadOnlyModelViewSet):
    """
    GET /api/attendance/           — list with filters
    GET /api/attendance/{id}/      — single record
    """
    serializer_class = AttendanceRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = AttendanceRecord.objects.select_related(
            'student', 'marked_by'
        )
        p = self.request.query_params
        if p.get('student'):
            qs = qs.filter(student__pk=p['student'])
        if p.get('date'):
            qs = qs.filter(date=p['date'])
        if p.get('level'):
            qs = qs.filter(student__level=p['level'])
        if p.get('stream'):
            qs = qs.filter(student__stream__iexact=p['stream'])
        return qs


class BulkAttendanceView(APIView):
    """
    POST /api/attendance/bulk/
    Accepts a full class register in one request.
    Creates/updates records and fires AbsenceAlert signals.
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = BulkAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        date = data['date']
        session = data['session']
        records = data['records']

        created_count = 0
        updated_count = 0
        errors = []

        for item in records:
            student = item['student_id']   # already resolved to Student by serializer
            att_status = item['status']
            reason = item.get('reason', '')

            obj, created = AttendanceRecord.objects.update_or_create(
                student=student,
                date=date,
                session=session,
                defaults={
                    'status': att_status,
                    'reason': reason,
                    'marked_by': request.user,
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        return Response(
            {
                'detail': f'{created_count} created, {updated_count} updated.',
                'created': created_count,
                'updated': updated_count,
            },
            status=status.HTTP_201_CREATED,
        )


class AttendanceSummaryView(APIView):
    """
    GET /api/attendance/summary/?student=&month=&year=
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        student_pk = request.query_params.get('student')
        month = request.query_params.get('month')
        year = request.query_params.get('year')

        if not student_pk:
            return Response(
                {'detail': 'student query param is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = AttendanceRecord.objects.filter(student__pk=student_pk)
        if year:
            qs = qs.filter(date__year=year)
        if month:
            qs = qs.filter(date__month=month)

        counts = {s: 0 for s in AttendanceStatus.values}
        for record in qs.values_list('status', flat=True):
            counts[record] = counts.get(record, 0) + 1

        total = sum(counts.values())
        present_count = counts[AttendanceStatus.PRESENT] + counts[AttendanceStatus.LATE]
        attendance_percent = (
            round(Decimal(present_count) / Decimal(total) * 100, 2)
            if total > 0
            else Decimal('0')
        )

        return Response(
            {
                'total_days': total,
                'present': counts[AttendanceStatus.PRESENT],
                'absent': counts[AttendanceStatus.ABSENT],
                'late': counts[AttendanceStatus.LATE],
                'excused': counts[AttendanceStatus.EXCUSED],
                'attendance_percent': str(attendance_percent),
            }
        )


class AbsenteesView(APIView):
    """
    GET /api/attendance/absentees/?date=&level=
    Returns absent students with primary guardian contact for SMS trigger.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        date = request.query_params.get('date')
        level = request.query_params.get('level')

        if not date:
            return Response(
                {'detail': 'date query param is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = AttendanceRecord.objects.filter(
            date=date,
            status=AttendanceStatus.ABSENT,
        ).select_related('student').prefetch_related('student__guardians')

        if level:
            qs = qs.filter(student__level=level)

        result = []
        for record in qs.order_by('student__last_name'):
            student = record.student
            primary = (
                student.guardians.filter(is_primary_contact=True).first()
                or student.guardians.first()
            )
            result.append(
                {
                    'student_id': student.student_id,
                    'student_name': student.full_name,
                    'level': student.level,
                    'stream': student.stream,
                    'guardian_name': primary.full_name if primary else '',
                    'guardian_phone': primary.phone if primary else '',
                    'reason': record.reason,
                }
            )

        return Response(result)
