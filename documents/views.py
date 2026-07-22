from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ModelViewSet

from accounts.models import Role

from .models import StudentDocument
from .serializers import StudentDocumentSerializer

# Documents like birth certificates and medical forms are sensitive — restrict the
# whole viewset (including read) to senior staff, not just write actions.
_ALLOWED_ROLES = {Role.OWNER, Role.HEADTEACHER, Role.ACADEMIC_TEACHER}


class StudentDocumentViewSet(ModelViewSet):
    """
    CRUD for per-student document attachments.
    Filter with ?student=&category=
    """
    serializer_class = StudentDocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = StudentDocument.objects.select_related('student', 'uploaded_by')
        p = self.request.query_params
        if p.get('student'):
            qs = qs.filter(student_id=p['student'])
        if p.get('category'):
            qs = qs.filter(category=p['category'])
        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.is_authenticated and request.user.role not in _ALLOWED_ROLES:
            raise PermissionDenied('You do not have permission to access student documents.')

    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)
