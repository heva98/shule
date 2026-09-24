from django.urls import include, path
from rest_framework.routers import DefaultRouter

from exams.views import ReportCardPDFView, ReportCardView

from .views import GuardianViewSet, StreamListView, StudentViewSet

router = DefaultRouter()
router.register(r'guardians', GuardianViewSet, basename='guardian')
router.register(r'', StudentViewSet, basename='student')

urlpatterns = [
    path('streams/', StreamListView.as_view(), name='stream-list'),
    path('', include(router.urls)),
    # Report card — cross-app view, student-scoped URL. Uses the same opaque
    # public_id as the rest of the student endpoints, not the pk.
    path('<uuid:public_id>/report-card/', ReportCardView.as_view(), name='report-card'),
    path('<uuid:public_id>/report-card/pdf/', ReportCardPDFView.as_view(), name='report-card-pdf'),
]
