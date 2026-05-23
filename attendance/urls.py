from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AbsenteesView,
    AttendanceSummaryView,
    AttendanceViewSet,
    BulkAttendanceView,
)

router = DefaultRouter()
router.register(r'attendance', AttendanceViewSet, basename='attendance')

urlpatterns = [
    path('', include(router.urls)),
    path('attendance/bulk/', BulkAttendanceView.as_view(), name='attendance-bulk'),
    path('attendance/summary/', AttendanceSummaryView.as_view(), name='attendance-summary'),
    path('attendance/absentees/', AbsenteesView.as_view(), name='attendance-absentees'),
]
