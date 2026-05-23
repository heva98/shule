from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AbsenteesView,
    AttendanceSummaryView,
    AttendanceViewSet,
    BulkAttendanceView,
)

router = DefaultRouter()
router.register(r'', AttendanceViewSet, basename='attendance')

urlpatterns = [
    path('', include(router.urls)),
    path('bulk/', BulkAttendanceView.as_view(), name='attendance-bulk'),
    path('summary/', AttendanceSummaryView.as_view(), name='attendance-summary'),
    path('absentees/', AbsenteesView.as_view(), name='attendance-absentees'),
]
