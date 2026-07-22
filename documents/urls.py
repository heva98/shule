from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import StudentDocumentViewSet

router = DefaultRouter()
router.register(r'', StudentDocumentViewSet, basename='student-document')

urlpatterns = [
    path('', include(router.urls)),
]
