from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AnnouncementsView,
    BroadcastView,
    FeeReminderView,
    MessageHistoryViewSet,
    SendAbsenceAlertsView,
)

router = DefaultRouter()
router.register(r'history', MessageHistoryViewSet, basename='comm-history')

urlpatterns = [
    path('', include(router.urls)),
    path('announcements/', AnnouncementsView.as_view(), name='comm-announcements'),
    path('broadcast/', BroadcastView.as_view(), name='comm-broadcast'),
    path('fee-reminders/', FeeReminderView.as_view(), name='comm-fee-reminders'),
    path('send-absence-alerts/', SendAbsenceAlertsView.as_view(), name='comm-absence-alerts'),
]
