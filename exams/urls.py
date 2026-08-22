from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ClassPerformanceView,
    ExamViewSet,
    MySubjectPerformanceView,
    SchoolPerformanceView,
    SubjectPerformanceView,
    SubjectViewSet,
)

router = DefaultRouter()
router.register(r'subjects', SubjectViewSet, basename='subject')
router.register(r'', ExamViewSet, basename='exam')

urlpatterns = [
    path('class-performance/', ClassPerformanceView.as_view(), name='exam-class-performance'),
    path('school-performance/', SchoolPerformanceView.as_view(), name='exam-school-performance'),
    path('subject-performance/mine/', MySubjectPerformanceView.as_view(), name='exam-subject-performance-mine'),
    path('subject-performance/', SubjectPerformanceView.as_view(), name='exam-subject-performance'),
    path('', include(router.urls)),
]
