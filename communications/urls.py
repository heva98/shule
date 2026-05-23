from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BroadcastView, MessageHistoryViewSet, SendAbsenceAlertsView

router = DefaultRouter()
router.register(r'history', MessageHistoryViewSet, basename='comm-history')

urlpatterns = [
    path('', include(router.urls)),
    path('broadcast/', BroadcastView.as_view(), name='comm-broadcast'),
    path('send-absence-alerts/', SendAbsenceAlertsView.as_view(), name='comm-absence-alerts'),
]
