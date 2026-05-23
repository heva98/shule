from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ExamViewSet, ReportCardView, SubjectViewSet

router = DefaultRouter()
router.register(r'exams/subjects', SubjectViewSet, basename='subject')
router.register(r'exams', ExamViewSet, basename='exam')

urlpatterns = [
    path('', include(router.urls)),
    # Report card lives under the students namespace for a natural URL
    path('students/<int:pk>/report-card/', ReportCardView.as_view(), name='report-card'),
]
