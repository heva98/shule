from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AbsenteesView,
    AttendanceDailySummaryView,
    AttendanceSummaryView,
    AttendanceViewSet,
    BulkAttendanceView,
)

router = DefaultRouter()
router.register(r'', AttendanceViewSet, basename='attendance')

# Specific paths MUST come before include(router.urls).
# The router is registered with an empty prefix, so its detail pattern
# ^(?P<pk>[^/.]+)/$ would otherwise swallow string paths like daily-summary/.
urlpatterns = [
    path('bulk/', BulkAttendanceView.as_view(), name='attendance-bulk'),
    path('summary/', AttendanceSummaryView.as_view(), name='attendance-summary'),
    path('absentees/', AbsenteesView.as_view(), name='attendance-absentees'),
    path('daily-summary/', AttendanceDailySummaryView.as_view(), name='attendance-daily-summary'),
    path('', include(router.urls)),
]
