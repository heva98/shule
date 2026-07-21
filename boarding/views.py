from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.models import Role

from .models import BoardingAssignment, Dormitory
from .serializers import BoardingAssignmentSerializer, DormitorySerializer

# Roles that may manage dormitories and boarding assignments
_MANAGE_ROLES = {Role.OWNER, Role.HEADTEACHER, Role.DISCIPLINE_TEACHER}


class DormitoryViewSet(ModelViewSet):
    queryset = Dormitory.objects.all()
    serializer_class = DormitorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Dormitory.objects.select_related('warden__user').prefetch_related('assignments')
        p = self.request.query_params
        if p.get('gender'):
            qs = qs.filter(gender=p['gender'])
        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action in ('create', 'update', 'partial_update', 'destroy') and request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to manage dormitories.')


class BoardingAssignmentViewSet(ModelViewSet):
    """
    CRUD for boarding assignments.
    Filter with ?academic_year=&dormitory=&student=&active=true
    """
    serializer_class = BoardingAssignmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = BoardingAssignment.objects.select_related(
            'student', 'dormitory', 'academic_year', 'assigned_by'
        )
        p = self.request.query_params
        if p.get('academic_year'):
            qs = qs.filter(academic_year_id=p['academic_year'])
        if p.get('dormitory'):
            qs = qs.filter(dormitory_id=p['dormitory'])
        if p.get('student'):
            qs = qs.filter(student_id=p['student'])
        if p.get('active') is not None:
            qs = qs.filter(is_active=p['active'] == 'true')
        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action in ('create', 'update', 'partial_update', 'destroy') and request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to manage boarding assignments.')

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='vacate')
    def vacate(self, request, pk=None):
        assignment = self.get_object()
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to manage boarding assignments.')
        if not assignment.is_active:
            return Response({'detail': 'This assignment is already vacated.'}, status=status.HTTP_400_BAD_REQUEST)
        assignment.is_active = False
        assignment.vacated_at = timezone.now()
        assignment.save(update_fields=['is_active', 'vacated_at'])
        return Response(BoardingAssignmentSerializer(assignment).data)
