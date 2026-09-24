from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import ModuleEnabled

from .permissions import IsAnalyticsStaff
from .registry import catalogue


class DimensionsView(APIView):
    """GET /api/analytics/dimensions/: the metric/dimension registry, filtered
    by the deployment's modules and the caller's role groups."""
    module = 'analytics'
    permission_classes = [IsAuthenticated, ModuleEnabled, IsAnalyticsStaff]

    def get(self, request):
        return Response(catalogue(request.user.role))
