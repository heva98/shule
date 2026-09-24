from django.urls import path

from .views import AnalyticsQueryView, DimensionsView

urlpatterns = [
    path('dimensions/', DimensionsView.as_view(), name='analytics-dimensions'),
    path('query/', AnalyticsQueryView.as_view(), name='analytics-query'),
]
