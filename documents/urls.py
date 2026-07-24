from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import StudentDocumentDownloadView, StudentDocumentViewSet

router = DefaultRouter()
router.register(r'', StudentDocumentViewSet, basename='student-document')

urlpatterns = [
    path('<int:pk>/download/', StudentDocumentDownloadView.as_view(), name='student-document-download'),
    path('', include(router.urls)),
]
