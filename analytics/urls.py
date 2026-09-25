from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AnalyticsQueryView, DimensionsView, SavedVisualizationViewSet

router = DefaultRouter()
router.register('visualizations', SavedVisualizationViewSet, basename='analytics-visualization')

urlpatterns = [
    path('dimensions/', DimensionsView.as_view(), name='analytics-dimensions'),
    path('query/', AnalyticsQueryView.as_view(), name='analytics-query'),
] + router.urls
