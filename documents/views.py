import mimetypes
import os

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
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


class StudentDocumentDownloadView(APIView):
    """
    GET /api/documents/<pk>/download/
    The only way a student document's bytes should ever reach a browser.

    nginx blocks /media/student_documents/ directly (see deploy/nginx config) —
    this view is the sole gate: it checks the same role restriction as the
    viewset above, then in production hands the actual byte-serving back to
    nginx via X-Accel-Redirect (fast, but only reachable after this check
    passes). In dev there's no nginx in front, so it streams the file itself.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        doc = get_object_or_404(StudentDocument.objects.select_related('student'), pk=pk)
        if request.user.role not in _ALLOWED_ROLES:
            raise PermissionDenied('You do not have permission to access student documents.')
        if not doc.file:
            raise Http404

        filename = os.path.basename(doc.file.name)
        content_type = mimetypes.guess_type(filename)[0] or 'application/octet-stream'

        if settings.DEBUG:
            response = FileResponse(doc.file.open('rb'), content_type=content_type)
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response

        response = HttpResponse(content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['X-Accel-Redirect'] = f'/protected-media/{doc.file.name}'
        return response
