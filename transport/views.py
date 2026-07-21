from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.models import Role

from .models import PickupPoint, Route, RouteFee, TransportAssignment
from .serializers import (
    PickupPointSerializer,
    RouteFeeSerializer,
    RouteSerializer,
    TransportAssignmentSerializer,
)

# Roles that may manage routes, pickup points, fees, and assignments
_MANAGE_ROLES = {Role.OWNER, Role.HEADTEACHER, Role.BURSAR}


class RouteViewSet(ModelViewSet):
    serializer_class = RouteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Route.objects.prefetch_related('pickup_points', 'assignments')
        p = self.request.query_params
        if p.get('active') is not None:
            qs = qs.filter(is_active=p['active'] == 'true')
        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action in ('create', 'update', 'partial_update', 'destroy') and request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to manage transport routes.')


class PickupPointViewSet(ModelViewSet):
    serializer_class = PickupPointSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = PickupPoint.objects.select_related('route')
        route = self.request.query_params.get('route')
        if route:
            qs = qs.filter(route_id=route)
        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action in ('create', 'update', 'partial_update', 'destroy') and request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to manage pickup points.')


class RouteFeeViewSet(ModelViewSet):
    serializer_class = RouteFeeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = RouteFee.objects.select_related('route', 'academic_year')
        p = self.request.query_params
        if p.get('route'):
            qs = qs.filter(route_id=p['route'])
        if p.get('academic_year'):
            qs = qs.filter(academic_year_id=p['academic_year'])
        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action in ('create', 'update', 'partial_update', 'destroy') and request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to manage transport fees.')


class TransportAssignmentViewSet(ModelViewSet):
    """
    CRUD for student transport assignments.
    Filter with ?academic_year=&route=&student=&active=true
    """
    serializer_class = TransportAssignmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = TransportAssignment.objects.select_related(
            'student', 'route', 'pickup_point', 'academic_year', 'assigned_by'
        )
        p = self.request.query_params
        if p.get('academic_year'):
            qs = qs.filter(academic_year_id=p['academic_year'])
        if p.get('route'):
            qs = qs.filter(route_id=p['route'])
        if p.get('student'):
            qs = qs.filter(student_id=p['student'])
        if p.get('active') is not None:
            qs = qs.filter(is_active=p['active'] == 'true')
        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action in ('create', 'update', 'partial_update', 'destroy') and request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to manage transport assignments.')

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='vacate')
    def vacate(self, request, pk=None):
        assignment = self.get_object()
        if request.user.role not in _MANAGE_ROLES:
            raise PermissionDenied('You do not have permission to manage transport assignments.')
        if not assignment.is_active:
            return Response({'detail': 'This assignment is already vacated.'}, status=status.HTTP_400_BAD_REQUEST)
        assignment.is_active = False
        assignment.vacated_at = timezone.now()
        assignment.save(update_fields=['is_active', 'vacated_at'])
        return Response(TransportAssignmentSerializer(assignment).data)
