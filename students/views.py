from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.filters import SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.models import Role

from .models import Guardian, Student, StudentStatus
from .serializers import (
    GuardianSerializer,
    StudentSerializer,
    StudentWriteSerializer,
)

# Roles that may view student records at all (matches the frontend's
# FEATURE_ROLES.STUDENTS) — deliberately excludes PARENT/STUDENT, who only
# ever see their own children through the separate my-children action.
_VIEW_ROLES = {
    Role.OWNER, Role.HEADTEACHER, Role.TEACHER, Role.BURSAR,
    Role.ACADEMIC_TEACHER, Role.CLASS_TEACHER, Role.SUBJECT_TEACHER, Role.DISCIPLINE_TEACHER,
}
# Roles that may create a new student record (matches the frontend's /students/new route)
_CREATE_ROLES = {Role.OWNER, Role.HEADTEACHER}
# Roles that may edit an existing student or their guardians (matches /students/:id/edit)
_EDIT_ROLES = {
    Role.OWNER, Role.HEADTEACHER, Role.ACADEMIC_TEACHER,
    Role.CLASS_TEACHER, Role.SUBJECT_TEACHER, Role.DISCIPLINE_TEACHER,
}


class StudentViewSet(ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends = [SearchFilter]
    search_fields = ['first_name', 'last_name', 'student_id', 'nemis_id']
    # Look up by the opaque public_id (a UUID) instead of the sequential pk or
    # the human-readable student_id — a URL/link should neither leak how many
    # students exist nor double as a guessable credential.
    lookup_field = 'public_id'
    lookup_value_regex = '[0-9a-f-]{36}'

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action == 'my_children':
            return  # any authenticated user (parent) may fetch their own children
        if request.user.role not in _VIEW_ROLES:
            raise PermissionDenied('You do not have permission to access student records.')
        if self.action == 'create' and request.user.role not in _CREATE_ROLES:
            raise PermissionDenied('Only Owner or Headteacher can add new students.')
        if self.action in ('update', 'partial_update', 'destroy') and request.user.role not in _EDIT_ROLES:
            raise PermissionDenied('You do not have permission to edit this student record.')
        if self.action == 'guardians' and request.method == 'POST' and request.user.role not in _EDIT_ROLES:
            raise PermissionDenied('You do not have permission to add a guardian.')

    def get_queryset(self):
        qs = Student.objects.prefetch_related('guardians').all()
        level = self.request.query_params.get('level')
        stream = self.request.query_params.get('stream')
        status_param = self.request.query_params.get('status')
        gender = self.request.query_params.get('gender')
        if level:
            qs = qs.filter(level=level)
        if stream:
            qs = qs.filter(stream__iexact=stream)
        if status_param:
            qs = qs.filter(status=status_param)
        if gender:
            qs = qs.filter(gender=gender)
        return qs

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return StudentWriteSerializer
        return StudentSerializer

    def paginate_queryset(self, queryset):
        if self.request.query_params.get('all') == 'true':
            return None
        return super().paginate_queryset(queryset)

    def destroy(self, request, *args, **kwargs):
        """Soft delete: mark as EXPELLED instead of removing the row."""
        student = self.get_object()
        student.status = StudentStatus.EXPELLED
        student.save(update_fields=['status', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'], url_path='my-children')
    def my_children(self, request):
        """Return active students whose guardian phone or email matches the logged-in user."""
        user = request.user
        filters = Q(guardians__phone=user.phone)
        if user.email:
            filters |= Q(guardians__email=user.email)
        children = (
            Student.objects
            .filter(filters, status=StudentStatus.ACTIVE)
            .distinct()
            .prefetch_related('guardians')
        )
        serializer = StudentSerializer(children, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['get', 'post'], url_path='guardians')
    def guardians(self, request, public_id=None):
        student = self.get_object()

        if request.method == 'GET':
            serializer = GuardianSerializer(student.guardians.all(), many=True)
            return Response(serializer.data)

        serializer = GuardianSerializer(data={**request.data, 'student': student.pk})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class GuardianViewSet(ModelViewSet):
    """
    Direct CRUD for a single guardian record — editing/removing a guardian
    after the fact. Creation stays on POST /students/<public_id>/guardians/
    since a new guardian is always created in the context of a student.
    """
    queryset = Guardian.objects.select_related('student')
    serializer_class = GuardianSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'patch', 'put', 'delete']

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role not in _VIEW_ROLES:
            raise PermissionDenied('You do not have permission to access guardian records.')
        if request.method in ('PATCH', 'PUT', 'DELETE') and request.user.role not in _EDIT_ROLES:
            raise PermissionDenied('You do not have permission to edit guardian records.')

    def get_queryset(self):
        qs = super().get_queryset()
        student = self.request.query_params.get('student')
        if student:
            qs = qs.filter(student_id=student)
        return qs
