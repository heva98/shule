from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import ModuleEnabled

from .permissions import IsAnalyticsStaff
from .query import QueryError, run_query
from .registry import catalogue


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
