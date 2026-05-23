from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BroadcastView, MessageHistoryViewSet, SendAbsenceAlertsView

router = DefaultRouter()
router.register(r'communications/history', MessageHistoryViewSet, basename='comm-history')

urlpatterns = [
    path('', include(router.urls)),
    path('communications/broadcast/', BroadcastView.as_view(), name='comm-broadcast'),
    path(
        'communications/send-absence-alerts/',
        SendAbsenceAlertsView.as_view(),
        name='comm-absence-alerts',
    ),
]
