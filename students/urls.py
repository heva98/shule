from django.urls import include, path
from rest_framework.routers import DefaultRouter

from exams.views import ReportCardView

from .views import StudentViewSet

router = DefaultRouter()
router.register(r'', StudentViewSet, basename='student')

urlpatterns = [
    path('', include(router.urls)),
    # Report card — cross-app view, student-scoped URL
    path('<int:pk>/report-card/', ReportCardView.as_view(), name='report-card'),
]
