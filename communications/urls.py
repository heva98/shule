from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .sms_views import (
    SmsBatchResendFailedView,
    SmsBatchViewSet,
    SmsConfigView,
    SmsPreviewView,
    SmsSendableExamsView,
    SmsSendView,
    SmsTemplateViewSet,
)
from .views import (
    AnnouncementsView,
    BroadcastView,
    BulkFeeReminderView,
    DemoRequestView,
    FeeReminderView,
    MessageHistoryViewSet,
    SendAbsenceAlertsView,
)

router = DefaultRouter()
router.register(r'history', MessageHistoryViewSet, basename='comm-history')
router.register(r'sms/templates', SmsTemplateViewSet, basename='sms-template')
router.register(r'sms/batches', SmsBatchViewSet, basename='sms-batch')

urlpatterns = [
    path('', include(router.urls)),
    path('announcements/', AnnouncementsView.as_view(), name='comm-announcements'),
    path('broadcast/', BroadcastView.as_view(), name='comm-broadcast'),
    path('fee-reminders/', FeeReminderView.as_view(), name='comm-fee-reminders'),
    path('bulk-fee-reminders/', BulkFeeReminderView.as_view(), name='comm-bulk-fee-reminders'),
    path('send-absence-alerts/', SendAbsenceAlertsView.as_view(), name='comm-absence-alerts'),
    path('demo-requests/', DemoRequestView.as_view(), name='comm-demo-requests'),

    # ── SMS ──
    path('sms/config/', SmsConfigView.as_view(), name='sms-config'),
    path('sms/preview/', SmsPreviewView.as_view(), name='sms-preview'),
    path('sms/send/', SmsSendView.as_view(), name='sms-send'),
    path('sms/exams/', SmsSendableExamsView.as_view(), name='sms-exams'),
    path('sms/batches/<int:pk>/resend-failed/', SmsBatchResendFailedView.as_view(),
         name='sms-batch-resend-failed'),
]
