from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import LoginView, MeView, NotificationsView, SchoolConfigView

urlpatterns = [
    path('login/',          LoginView.as_view(),           name='auth-login'),
    path('token/refresh/',  TokenRefreshView.as_view(),    name='auth-token-refresh'),
    path('me/',             MeView.as_view(),              name='auth-me'),
    path('notifications/',  NotificationsView.as_view(),   name='auth-notifications'),
    path('school-config/',  SchoolConfigView.as_view(),    name='school-config'),
]
