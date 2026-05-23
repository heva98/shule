from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ExamViewSet, SubjectViewSet

router = DefaultRouter()
router.register(r'subjects', SubjectViewSet, basename='subject')
router.register(r'', ExamViewSet, basename='exam')

urlpatterns = [
    path('', include(router.urls)),
]
