from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ClassPerformanceView, ExamViewSet, SubjectPerformanceView, SubjectViewSet

router = DefaultRouter()
router.register(r'subjects', SubjectViewSet, basename='subject')
router.register(r'', ExamViewSet, basename='exam')

urlpatterns = [
    path('class-performance/', ClassPerformanceView.as_view(), name='exam-class-performance'),
    path('subject-performance/', SubjectPerformanceView.as_view(), name='exam-subject-performance'),
    path('', include(router.urls)),
]
