from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import HomePackageViewSet

router = DefaultRouter()
router.register(r'', HomePackageViewSet, basename='home-package')

urlpatterns = [
    path('', include(router.urls)),
]
