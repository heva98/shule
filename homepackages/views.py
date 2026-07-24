from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import CONTENT_CREATOR_ROLES, SENIOR_STAFF_ROLES

from .models import HomePackage
from .serializers import HomePackageSerializer

# Roles that may post a home package
_CREATE_ROLES = CONTENT_CREATOR_ROLES
# Roles that may edit/delete someone else's post (the original poster always can)
_SENIOR_ROLES = SENIOR_STAFF_ROLES


class HomePackageViewSet(ModelViewSet):
    """
    CRUD for holiday home packages.
    Filter with ?academic_year=&quarter=&level=&stream=&subject=
    """
    serializer_class = HomePackageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = HomePackage.objects.select_related('subject', 'posted_by', 'academic_year')
        p = self.request.query_params
        if p.get('academic_year'):
            qs = qs.filter(academic_year_id=p['academic_year'])
        if p.get('quarter'):
            qs = qs.filter(quarter=p['quarter'])
        if p.get('level'):
            qs = qs.filter(level=p['level'])
        if p.get('stream'):
            qs = qs.filter(stream=p['stream'])
        if p.get('subject'):
            qs = qs.filter(subject_id=p['subject'])
        if p.get('posted_by') == 'me':
            qs = qs.filter(posted_by=self.request.user)
        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action == 'create' and request.user.role not in _CREATE_ROLES:
            raise PermissionDenied('You do not have permission to post home packages.')

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if self.action in ('update', 'partial_update', 'destroy'):
            if obj.posted_by_id != request.user.id and request.user.role not in _SENIOR_ROLES:
                raise PermissionDenied('Only the original poster or senior staff can edit or delete this.')

    def perform_create(self, serializer):
        serializer.save(posted_by=self.request.user)
