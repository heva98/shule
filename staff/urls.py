from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import LeaveRequestViewSet, StaffViewSet

router = DefaultRouter()
router.register(r'staff', StaffViewSet, basename='staff')
router.register(r'staff/leave', LeaveRequestViewSet, basename='leave')

urlpatterns = [
    path('', include(router.urls)),
]
