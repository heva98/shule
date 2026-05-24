from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.filters import SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet, ViewSet

from accounts.models import Role
from accounts.permissions import (
    IsDisciplineTeacher,
    IsHeadteacher,
    IsOwner,
    IsSeniorStaff,
)

from .models import (
    ClassTeacherAssignment,
    DisciplinaryIncident,
    LeaveRequest,
    LeaveStatus,
    StaffProfile,
)
from .serializers import (
    ClassTeacherAssignmentCreateSerializer,
    ClassTeacherAssignmentSerializer,
    DisciplinaryIncidentSerializer,
    DisciplinaryReferSerializer,
    LeaveRequestSerializer,
    LeaveReviewSerializer,
    StaffProfileSerializer,
    StaffProfileWriteSerializer,
)


# ── Staff directory ────────────────────────────────────────────────────────────

class StaffViewSet(ModelViewSet):
    filter_backends = [SearchFilter]
    search_fields   = ['user__full_name', 'employee_id', 'tsc_number', 'designation']

    def get_queryset(self):
        return (
            StaffProfile.objects
            .select_related('user')
            .prefetch_related('subjects', 'class_assignments__academic_year')
            .all()
        )

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return StaffProfileWriteSerializer
        return StaffProfileSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [(IsOwner | IsHeadteacher)()]
        return [IsAuthenticated()]


# ── Leave requests ─────────────────────────────────────────────────────────────

class LeaveRequestViewSet(ModelViewSet):
    serializer_class = LeaveRequestSerializer

    def get_queryset(self):
        qs = LeaveRequest.objects.select_related('staff__user', 'reviewed_by')
        req_status = self.request.query_params.get('status')
        if req_status:
            qs = qs.filter(status=req_status)
        user = self.request.user
        if user.role not in (Role.OWNER, Role.HEADTEACHER, Role.BURSAR):
            try:
                qs = qs.filter(staff=user.staff_profile)
            except StaffProfile.DoesNotExist:
                return LeaveRequest.objects.none()
        return qs

    def get_permissions(self):
        if self.action in ('approve', 'reject'):
            return [(IsOwner | IsHeadteacher)()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        user = self.request.user
        if user.role not in (Role.OWNER, Role.HEADTEACHER):
            try:
                serializer.save(staff=user.staff_profile)
                return
            except StaffProfile.DoesNotExist:
                raise PermissionDenied('No staff profile linked to your account.')
        serializer.save()

    @action(detail=True, methods=['put'], url_path='approve')
    def approve(self, request, pk=None):
        leave = self.get_object()
        if leave.status != LeaveStatus.PENDING:
            return Response(
                {'detail': f'Cannot approve a leave that is already {leave.status}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        LeaveReviewSerializer(data=request.data).is_valid(raise_exception=True)
        leave.status      = LeaveStatus.APPROVED
        leave.reviewed_by = request.user
        leave.reviewed_at = timezone.now()
        leave.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])
        _notify_leave_decision(leave, approved=True)
        return Response(LeaveRequestSerializer(leave).data)

    @action(detail=True, methods=['put'], url_path='reject')
    def reject(self, request, pk=None):
        leave = self.get_object()
        if leave.status != LeaveStatus.PENDING:
            return Response(
                {'detail': f'Cannot reject a leave that is already {leave.status}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        LeaveReviewSerializer(data=request.data).is_valid(raise_exception=True)
        leave.status      = LeaveStatus.REJECTED
        leave.reviewed_by = request.user
        leave.reviewed_at = timezone.now()
        leave.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])
        _notify_leave_decision(leave, approved=False)
        return Response(LeaveRequestSerializer(leave).data)


def _notify_leave_decision(leave: LeaveRequest, approved: bool):
    try:
        from communications.services import NotificationService
        decision = 'approved' if approved else 'rejected'
        NotificationService.notify_staff(
            staff_profile=leave.staff,
            title=f'Leave Request {decision.capitalize()}',
            message=(
                f'Your {leave.leave_type} leave request from '
                f'{leave.start_date} to {leave.end_date} has been {decision}.'
            ),
            category='LEAVE',
        )
    except Exception:
        pass


# ── Class Teacher Assignments ──────────────────────────────────────────────────

class ClassAssignmentViewSet(ViewSet):
    """
    POST   /api/staff/class-assignments/         — assign a teacher
    GET    /api/staff/class-assignments/         — list active assignments
    DELETE /api/staff/class-assignments/{pk}/    — deactivate assignment
    """

    def get_permissions(self):
        if self.action == 'list':
            return [IsAuthenticated()]
        return [(IsOwner | IsHeadteacher | IsSeniorStaff)()]

    def list(self, request):
        qs = (
            ClassTeacherAssignment.objects
            .filter(is_active=True)
            .select_related('teacher__user', 'academic_year', 'assigned_by')
        )
        year = request.query_params.get('year')
        if year:
            qs = qs.filter(academic_year__year=year)
        return Response(ClassTeacherAssignmentSerializer(qs, many=True).data)

    def create(self, request):
        ser = ClassTeacherAssignmentCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        assignment = ClassTeacherAssignment.objects.create(
            teacher=d['teacher_id'],           # resolved to StaffProfile
            level=d['level'],
            stream=d['stream'],
            academic_year=d['academic_year'],
            assigned_by=request.user,
        )

        # Notify assigned teacher
        try:
            from communications.services import NotificationService
            NotificationService.notify_staff(
                staff_profile=assignment.teacher,
                title='Class Teacher Assignment',
                message=(
                    f'You have been assigned as class teacher of '
                    f'{assignment.level}{assignment.stream.upper()} '
                    f'for {assignment.academic_year}. '
                    f'Please log in to Shule SMS for details.'
                ),
                category='CLASS_ASSIGNMENT',
            )
        except Exception:
            pass

        return Response(
            ClassTeacherAssignmentSerializer(assignment).data,
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, pk=None):
        try:
            assignment = ClassTeacherAssignment.objects.get(pk=pk)
        except ClassTeacherAssignment.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        assignment.is_active = False
        assignment.save(update_fields=['is_active'])
        return Response({'detail': 'Assignment removed.'}, status=status.HTTP_200_OK)


# ── My Class (Class Teacher self-service) ─────────────────────────────────────

class MyClassView(APIView):
    """GET /api/staff/my-class/ — returns the class teacher's current assignment."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != Role.CLASS_TEACHER:
            return Response(
                {'detail': 'Only class teachers have a class assignment.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            profile = request.user.staff_profile
        except StaffProfile.DoesNotExist:
            return Response(
                {'detail': 'No staff profile linked to your account.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        assignment = profile.current_class_assignment
        if not assignment:
            return Response(
                {'detail': 'No active class assignment for the current academic year.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(ClassTeacherAssignmentSerializer(assignment).data)


# ── Disciplinary Incidents ─────────────────────────────────────────────────────

class DisciplinaryIncidentViewSet(ModelViewSet):
    """
    Discipline teachers log and manage incidents.
    Only discipline teachers can create incidents.
    OWNER / HEADTEACHER can see all; others see only incidents they reported.
    """
    serializer_class = DisciplinaryIncidentSerializer

    def get_queryset(self):
        qs = DisciplinaryIncident.objects.select_related(
            'student', 'reported_by__user', 'referred_to'
        )
        user = self.request.user
        if user.role in (Role.OWNER, Role.HEADTEACHER):
            pass
        elif user.role == Role.DISCIPLINE_TEACHER:
            try:
                qs = qs.filter(reported_by=user.staff_profile)
            except StaffProfile.DoesNotExist:
                return DisciplinaryIncident.objects.none()
        else:
            return DisciplinaryIncident.objects.none()

        # Optional filters
        p = self.request.query_params
        if p.get('student'):
            qs = qs.filter(student__pk=p['student'])
        if p.get('severity'):
            qs = qs.filter(severity=p['severity'])
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        return qs

    def get_permissions(self):
        if self.action == 'create':
            return [(IsDisciplineTeacher | IsOwner | IsHeadteacher)()]
        if self.action in ('refer', 'update', 'partial_update', 'destroy'):
            return [(IsDisciplineTeacher | IsOwner | IsHeadteacher)()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        user = self.request.user
        if user.role != Role.DISCIPLINE_TEACHER and user.role not in (
            Role.OWNER, Role.HEADTEACHER
        ):
            raise PermissionDenied('Only discipline teachers can log incidents.')
        try:
            serializer.save(reported_by=user.staff_profile)
        except StaffProfile.DoesNotExist:
            raise PermissionDenied('No staff profile linked to your account.')

    @action(detail=True, methods=['post'], url_path='refer')
    def refer(self, request, pk=None):
        """Refer an incident to the headteacher."""
        incident = self.get_object()
        if incident.status != DisciplinaryIncident.IncidentStatus.OPEN:
            return Response(
                {'detail': f'Incident is already {incident.status}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        DisciplinaryReferSerializer(data=request.data).is_valid(raise_exception=True)

        from accounts.models import User
        headteacher = User.objects.filter(
            role=Role.HEADTEACHER, is_active=True
        ).first()

        incident.status      = DisciplinaryIncident.IncidentStatus.REFERRED
        incident.referred_to = headteacher
        incident.referred_at = timezone.now()
        incident.save(update_fields=['status', 'referred_to', 'referred_at'])

        # Notify headteacher
        if headteacher:
            try:
                from communications.services import NotificationService
                from accounts.models import UserNotification
                UserNotification.objects.create(
                    user=headteacher,
                    title='Disciplinary Incident Referred',
                    message=(
                        f'A disciplinary incident for student '
                        f'{incident.student.full_name} ({incident.student.student_id}) '
                        f'has been referred to you by '
                        f'{incident.reported_by.user.full_name}. '
                        f'Incident: {incident.incident_type} | '
                        f'Severity: {incident.severity}.'
                    ),
                    category=UserNotification.Category.DISCIPLINE,
                )
            except Exception:
                pass

        return Response(DisciplinaryIncidentSerializer(incident).data)

    @action(detail=True, methods=['post'], url_path='resolve')
    def resolve(self, request, pk=None):
        incident = self.get_object()
        if incident.status == DisciplinaryIncident.IncidentStatus.RESOLVED:
            return Response(
                {'detail': 'Incident is already resolved.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        action_taken = request.data.get('action_taken', '')
        incident.status       = DisciplinaryIncident.IncidentStatus.RESOLVED
        incident.action_taken = action_taken
        incident.resolved_at  = timezone.now()
        incident.save(update_fields=['status', 'action_taken', 'resolved_at'])
        return Response(DisciplinaryIncidentSerializer(incident).data)
