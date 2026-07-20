from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ModelViewSet

from .models import Period, TimetableEntry
from .serializers import PeriodSerializer, TimetableEntrySerializer


class PeriodViewSet(ModelViewSet):
    """CRUD for the school's daily period slots (shared across all classes)."""
    queryset = Period.objects.all()
    serializer_class = PeriodSerializer
    permission_classes = [IsAuthenticated]


class TimetableEntryViewSet(ModelViewSet):
    """
    CRUD for scheduled lessons.
    Filter with ?academic_year=&level=&stream=&teacher=
    Pass ?mine=true to get the requesting teacher's own schedule.
    """
    serializer_class = TimetableEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = TimetableEntry.objects.select_related(
            'period', 'subject', 'teacher__user', 'academic_year'
        )
        p = self.request.query_params

        if p.get('mine') == 'true':
            staff_profile = getattr(self.request.user, 'staff_profile', None)
            qs = qs.filter(teacher=staff_profile) if staff_profile else qs.none()

        if p.get('academic_year'):
            qs = qs.filter(academic_year_id=p['academic_year'])
        if p.get('level'):
            qs = qs.filter(level=p['level'])
        if p.get('stream'):
            qs = qs.filter(stream=p['stream'])
        if p.get('teacher'):
            qs = qs.filter(teacher_id=p['teacher'])

        return qs
