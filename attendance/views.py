from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet

from accounts.models import Role

from .models import AttendanceRecord, AttendanceStatus
from .serializers import (
    AttendanceRecordSerializer,
    BulkAttendanceSerializer,
)

# Roles that may mark attendance for any class
_UNRESTRICTED_ROLES = {
    Role.OWNER, Role.HEADTEACHER, Role.ACADEMIC_TEACHER, Role.TEACHER,
}

# Roles that may browse attendance broadly (matches the frontend's
# FEATURE_ROLES.ATTENDANCE). Parents are handled separately — they may read,
# but only ever their own children's records (enforced below).
_VIEW_ROLES = {
    Role.OWNER, Role.HEADTEACHER, Role.TEACHER, Role.ACADEMIC_TEACHER,
    Role.CLASS_TEACHER, Role.SUBJECT_TEACHER, Role.DISCIPLINE_TEACHER,
}


def _is_own_child(user, student_pk):
    if not student_pk:
        return False
    from students.models import Student
    child_filter = Q(pk=student_pk, guardians__phone=user.phone)
    if user.email:
        child_filter |= Q(pk=student_pk, guardians__email=user.email)
    return Student.objects.filter(child_filter).exists()


class AttendanceViewSet(ReadOnlyModelViewSet):
    """
    GET /api/attendance/        — list with filters
    GET /api/attendance/{id}/   — single record
    """
    serializer_class   = AttendanceRecordSerializer
    permission_classes = [IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _VIEW_ROLES and request.user.role != Role.PARENT:
            raise PermissionDenied('You do not have permission to view attendance records.')

    def get_queryset(self):
        qs = AttendanceRecord.objects.select_related('student', 'marked_by')
        user = self.request.user
        if user.role == Role.PARENT:
            child_filter = Q(student__guardians__phone=user.phone)
            if user.email:
                child_filter |= Q(student__guardians__email=user.email)
            qs = qs.filter(child_filter).distinct()

        p  = self.request.query_params
        if p.get('student'):
            qs = qs.filter(student__pk=p['student'])
        if p.get('date'):
            qs = qs.filter(date=p['date'])
        if p.get('level'):
            qs = qs.filter(student__level=p['level'])
        if p.get('stream'):
            qs = qs.filter(student__stream__iexact=p['stream'])
        if p.get('month'):
            qs = qs.filter(date__month=p['month'])
        if p.get('year'):
            qs = qs.filter(date__year=p['year'])
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('quarter'):
            qs = qs.filter(quarter=p['quarter'])
        return qs

    def paginate_queryset(self, queryset):
        if self.request.query_params.get('all') == 'true':
            return None
        return super().paginate_queryset(queryset)


class BulkAttendanceView(APIView):
    """
    POST /api/attendance/bulk/
    Accepts a full class register in one request.
    Class teachers may only mark attendance for their assigned class.
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = BulkAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user  = request.user
        role  = user.role
        level = data.get('level', '')
        stream = data.get('stream', '')

        # Class teacher restriction
        if role == Role.CLASS_TEACHER:
            try:
                assignment = user.staff_profile.current_class_assignment
            except Exception:
                raise PermissionDenied('No staff profile found.')

            if not assignment:
                raise PermissionDenied(
                    'You are only authorised to mark attendance for your assigned class, '
                    'but you have no active class assignment for the current academic year.'
                )
            if level and level != assignment.level:
                raise PermissionDenied(
                    'You are only authorised to mark attendance for your assigned class.'
                )
            if stream and stream.lower() != assignment.stream.lower():
                raise PermissionDenied(
                    'You are only authorised to mark attendance for your assigned class.'
                )

        elif role not in _UNRESTRICTED_ROLES:
            raise PermissionDenied(
                'You do not have permission to mark attendance.'
            )

        date    = data['date']
        session = data['session']
        records = data['records']

        created_count = 0
        updated_count = 0

        for item in records:
            student    = item['student_id']
            att_status = item['status']
            reason     = item.get('reason', '')

            obj, created = AttendanceRecord.objects.update_or_create(
                student=student,
                date=date,
                session=session,
                defaults={
                    'status':    att_status,
                    'reason':    reason,
                    'marked_by': request.user,
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        return Response(
            {
                'detail':  f'{created_count} created, {updated_count} updated.',
                'created': created_count,
                'updated': updated_count,
            },
            status=status.HTTP_201_CREATED,
        )


class AttendanceSummaryView(APIView):
    """GET /api/attendance/summary/?student=&month=&year="""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        student_pk = request.query_params.get('student')
        month      = request.query_params.get('month')
        year       = request.query_params.get('year')

        if not student_pk:
            return Response(
                {'detail': 'student query param is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        role = request.user.role
        if role == Role.PARENT:
            if not _is_own_child(request.user, student_pk):
                raise PermissionDenied('You do not have permission to view this attendance summary.')
        elif role not in _VIEW_ROLES:
            raise PermissionDenied('You do not have permission to view attendance summaries.')

        qs = AttendanceRecord.objects.filter(student__pk=student_pk)
        if year:
            qs = qs.filter(date__year=year)
        if month:
            qs = qs.filter(date__month=month)

        counts = {s: 0 for s in AttendanceStatus.values}
        for record in qs.values_list('status', flat=True):
            counts[record] = counts.get(record, 0) + 1

        total         = sum(counts.values())
        present_count = counts[AttendanceStatus.PRESENT] + counts[AttendanceStatus.LATE]
        attendance_percent = (
            round(Decimal(present_count) / Decimal(total) * 100, 2)
            if total > 0
            else Decimal('0')
        )

        return Response({
            'total_days':        total,
            'present':           counts[AttendanceStatus.PRESENT],
            'absent':            counts[AttendanceStatus.ABSENT],
            'late':              counts[AttendanceStatus.LATE],
            'excused':           counts[AttendanceStatus.EXCUSED],
            'attendance_percent': str(attendance_percent),
        })


class AttendanceDailySummaryView(APIView):
    """
    GET /api/attendance/daily-summary/?date=YYYY-MM-DD
    School-wide attendance rate for a single day (defaults to today).
    Aggregate counts only (no student/guardian PII), also shown on the
    Bursar's dashboard — so Bursar is allowed here even though they're not
    in the general attendance _VIEW_ROLES.
    """
    permission_classes = [IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _VIEW_ROLES | {Role.BURSAR}:
            raise PermissionDenied('You do not have permission to view this summary.')

    def get(self, request):
        date_str = request.query_params.get('date') or str(timezone.localdate())
        qs       = AttendanceRecord.objects.filter(date=date_str)
        total    = qs.count()
        present  = qs.filter(
            status__in=[AttendanceStatus.PRESENT, AttendanceStatus.LATE]
        ).count()
        absent   = qs.filter(status=AttendanceStatus.ABSENT).count()
        excused  = qs.filter(status=AttendanceStatus.EXCUSED).count()
        rate     = round(present / total * 100, 1) if total > 0 else 0
        return Response({
            'date':          date_str,
            'total_records': total,
            'present':       present,
            'absent':        absent,
            'excused':       excused,
            'rate_percent':  str(rate),
        })


class AbsenteesView(APIView):
    """
    GET /api/attendance/absentees/?date=&level=
    Returns absent students with primary guardian contact for SMS trigger.
    """
    permission_classes = [IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _VIEW_ROLES:
            raise PermissionDenied('You do not have permission to view absentee contact details.')

    def get(self, request):
        date  = request.query_params.get('date')
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
            # Reuse the prefetched 'student__guardians' cache — `.filter().first()`
            # would issue a fresh query per row despite the prefetch above.
            guardians = list(student.guardians.all())
            primary = next(
                (g for g in guardians if g.is_primary_contact),
                guardians[0] if guardians else None,
            )
            result.append({
                'student_id':    student.student_id,
                'student_name':  student.full_name,
                'level':         student.level,
                'stream':        student.stream,
                'guardian_name': primary.full_name if primary else '',
                'guardian_phone': primary.phone if primary else '',
                'reason':        record.reason,
            })

        return Response(result)
