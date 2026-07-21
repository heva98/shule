from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    PickupPointViewSet,
    RouteFeeViewSet,
    RouteViewSet,
    TransportAssignmentViewSet,
)

router = DefaultRouter()
router.register(r'routes', RouteViewSet, basename='route')
router.register(r'pickup-points', PickupPointViewSet, basename='pickup-point')
router.register(r'fees', RouteFeeViewSet, basename='transport-fee')
router.register(r'assignments', TransportAssignmentViewSet, basename='transport-assignment')

urlpatterns = [
    path('', include(router.urls)),
]
