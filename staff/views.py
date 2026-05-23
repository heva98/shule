from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.models import Role
from accounts.permissions import IsHeadteacher, IsOwner

from .models import LeaveRequest, LeaveStatus, StaffProfile
from .serializers import (
    LeaveRequestSerializer,
    LeaveReviewSerializer,
    StaffProfileSerializer,
    StaffProfileWriteSerializer,
)


class StaffViewSet(ModelViewSet):
    filter_backends = [SearchFilter]
    search_fields = [
        'user__full_name', 'employee_id',
        'tsc_number', 'designation',
    ]

    def get_queryset(self):
        return (
            StaffProfile.objects
            .select_related('user')
            .prefetch_related('subjects')
            .all()
        )

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return StaffProfileWriteSerializer
        return StaffProfileSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            # Only owner or headteacher can write staff records
            return [(IsOwner | IsHeadteacher)()]
        return [IsAuthenticated()]


class LeaveRequestViewSet(ModelViewSet):
    serializer_class = LeaveRequestSerializer

    def get_queryset(self):
        qs = LeaveRequest.objects.select_related(
            'staff__user', 'reviewed_by'
        )
        req_status = self.request.query_params.get('status')
        if req_status:
            qs = qs.filter(status=req_status)

        # Non-admin staff see only their own requests
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
        # Staff can only submit leave for themselves unless they are admin
        user = self.request.user
        if user.role not in (Role.OWNER, Role.HEADTEACHER):
            try:
                serializer.save(staff=user.staff_profile)
                return
            except StaffProfile.DoesNotExist:
                from rest_framework.exceptions import PermissionDenied
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
        serializer = LeaveReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        leave.status = LeaveStatus.APPROVED
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
        serializer = LeaveReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        leave.status = LeaveStatus.REJECTED
        leave.reviewed_by = request.user
        leave.reviewed_at = timezone.now()
        leave.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])

        _notify_leave_decision(leave, approved=False)
        return Response(LeaveRequestSerializer(leave).data)


def _notify_leave_decision(leave: LeaveRequest, approved: bool):
    """
    Placeholder for SMS/email notification to the staff member.
    Will be wired to the communications app in the next phase.
    """
    pass
