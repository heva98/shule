from django.urls import path

from .views import DimensionsView

urlpatterns = [
    path('dimensions/', DimensionsView.as_view(), name='analytics-dimensions'),
]
