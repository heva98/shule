from django.db.models import Exists, OuterRef, Q
from rest_framework import status, viewsets
from rest_framework.generics import get_object_or_404
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AuditLog
from accounts.permissions import ModuleEnabled
from accounts.utils import log_action

from .drilldown import run_drilldown
from .models import SavedVisualization
from .permissions import IsAnalyticsStaff
from .query import QueryError, run_query
from .registry import catalogue
from .serializers import SavedVisualizationSerializer


class DimensionsView(APIView):
    """GET /api/analytics/dimensions/: the metric/dimension registry, filtered
    by the deployment's modules and the caller's role groups."""
    module = 'analytics'
    permission_classes = [IsAuthenticated, ModuleEnabled, IsAnalyticsStaff]

    def get(self, request):
        return Response(catalogue(request.user.role))


class AnalyticsQueryView(APIView):
    """GET /api/analytics/query/: aggregated values for metrics × periods ×
    org units × other dimensions, in the DHIS2 /api/analytics shape. See
    `analytics.query` for the parameters."""
    module = 'analytics'
    permission_classes = [IsAuthenticated, ModuleEnabled, IsAnalyticsStaff]

    def get(self, request):
        try:
            return Response(run_query(request.query_params, request.user))
        except QueryError as exc:
            return Response(exc.body, status=exc.status)


class DrilldownView(APIView):
    """GET /api/analytics/drilldown/: the pupils behind one cell of a query,
    with each pupil's own value. See `analytics.drilldown`. Every successful
    call is audited, since it reads pupil-level data."""
    module = 'analytics'
    permission_classes = [IsAuthenticated, ModuleEnabled, IsAnalyticsStaff]

    def get(self, request):
        try:
            data = run_drilldown(request.query_params, request.user)
        except QueryError as exc:
            return Response(exc.body, status=exc.status)
        log_action(
            user=request.user,
            action=AuditLog.Action.ANALYTICS_DRILLDOWN,
            description=f"Listed {data['total']} pupils behind {data['metric']['id']}",
            target_model='analytics',
            request=request,
            extra_data={
                'dimension': request.query_params.getlist('dimension'),
                'filter': request.query_params.getlist('filter'),
            },
        )
        return Response(data)


class IsCreatorOrReadOnly(BasePermission):
    """A shared visualization is read-only to everyone but its creator; they
    can "save as" their own copy instead."""
    message = 'Only the person who saved this visualization can change it.'

    def has_object_permission(self, request, view, obj):
        return request.method in SAFE_METHODS or obj.created_by_id == request.user.id


class SavedVisualizationViewSet(viewsets.ModelViewSet):
    """/api/analytics/visualizations/: the caller's saved visualizations plus
    those other staff shared. `?pinned=true` lists the caller's dashboard
    widgets; `?search=` matches the name. POST/DELETE `<id>/pin/` pins or
    unpins one on the caller's own dashboard."""
    module = 'analytics'
    permission_classes = [IsAuthenticated, ModuleEnabled, IsAnalyticsStaff, IsCreatorOrReadOnly]
    serializer_class = SavedVisualizationSerializer
    # A school has tens of these, and the Open dialog searches the whole list.
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        pinned = SavedVisualization.pinned_by.through.objects.filter(
            savedvisualization_id=OuterRef('pk'), user_id=user.id,
        )
        qs = (
            SavedVisualization.objects
            .filter(Q(created_by=user) | Q(shared_with_staff=True))
            .select_related('created_by')
            .annotate(is_pinned=Exists(pinned))
        )
        params = self.request.query_params
        if params.get('pinned') == 'true':
            qs = qs.filter(is_pinned=True)
        if search := params.get('search', '').strip():
            qs = qs.filter(name__icontains=search)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        viz = serializer.save()
        if not viz.shared_with_staff:
            # Unsharing takes it off everyone else's dashboard too.
            viz.pinned_by.remove(*viz.pinned_by.exclude(pk=viz.created_by_id))

    @action(detail=True, methods=['post', 'delete'], url_path='pin')
    def pin(self, request, pk=None):
        # Pinning only touches the caller's own dashboard, so anyone who can
        # see the visualization may pin it: no creator-only object check.
        viz = get_object_or_404(self.get_queryset(), pk=pk)
        if request.method == 'POST':
            viz.pinned_by.add(request.user)
        else:
            viz.pinned_by.remove(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
