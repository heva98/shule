from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BoardingAssignmentViewSet, DormitoryViewSet

router = DefaultRouter()
router.register(r'dormitories', DormitoryViewSet, basename='dormitory')
router.register(r'assignments', BoardingAssignmentViewSet, basename='boarding-assignment')

urlpatterns = [
    path('', include(router.urls)),
]
