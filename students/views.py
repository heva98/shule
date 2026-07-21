from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .models import Guardian, Student, StudentStatus
from .serializers import (
    GuardianSerializer,
    StudentSerializer,
    StudentWriteSerializer,
)


class StudentViewSet(ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends = [SearchFilter]
    search_fields = ['first_name', 'last_name', 'student_id', 'nemis_id']

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
    def guardians(self, request, pk=None):
        student = self.get_object()

        if request.method == 'GET':
            serializer = GuardianSerializer(student.guardians.all(), many=True)
            return Response(serializer.data)

        serializer = GuardianSerializer(data={**request.data, 'student': student.pk})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
