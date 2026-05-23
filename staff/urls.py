from django.urls import include, path
from rest_framework.routers import SimpleRouter

from .views import LeaveRequestViewSet, StaffViewSet

# SimpleRouter avoids the api-root collision when registering r'' prefix
router = SimpleRouter()
router.register(r'', StaffViewSet, basename='staff')
router.register(r'leave', LeaveRequestViewSet, basename='leave')

urlpatterns = [
    path('', include(router.urls)),
]
