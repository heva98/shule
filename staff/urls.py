from django.urls import include, path
from rest_framework.routers import SimpleRouter

from .views import (
    ClassAssignmentViewSet,
    DisciplinaryIncidentViewSet,
    LeaveRequestViewSet,
    MyClassView,
    StaffViewSet,
)

router = SimpleRouter()
router.register(r'', StaffViewSet, basename='staff')
router.register(r'leave', LeaveRequestViewSet, basename='leave')

# Explicit paths come BEFORE include(router.urls) so they aren't swallowed
# by the r'' router's /{pk}/ catch-all pattern.
urlpatterns = [
    # Class teacher assignments
    path(
        'class-assignments/',
        ClassAssignmentViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='class-assignments-list',
    ),
    path(
        'class-assignments/<int:pk>/',
        ClassAssignmentViewSet.as_view({'delete': 'destroy'}),
        name='class-assignments-detail',
    ),

    # Class teacher self-service
    path('my-class/', MyClassView.as_view(), name='my-class'),

    # Disciplinary incidents
    path(
        'discipline/',
        DisciplinaryIncidentViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='discipline-list',
    ),
    path(
        'discipline/<int:pk>/',
        DisciplinaryIncidentViewSet.as_view({
            'get': 'retrieve',
            'put': 'update',
            'patch': 'partial_update',
        }),
        name='discipline-detail',
    ),
    path(
        'discipline/<int:pk>/refer/',
        DisciplinaryIncidentViewSet.as_view({'post': 'refer'}),
        name='discipline-refer',
    ),
    path(
        'discipline/<int:pk>/resolve/',
        DisciplinaryIncidentViewSet.as_view({'post': 'resolve'}),
        name='discipline-resolve',
    ),

    path('', include(router.urls)),
]
