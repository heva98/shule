from django.db import IntegrityError, transaction
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ModelViewSet

from .models import Period, TimetableEntry
from .serializers import PeriodSerializer, TimetableEntrySerializer

_TEACHER_CLASH_MESSAGE = 'This teacher is already scheduled for another class at this exact day and period.'


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

    def perform_create(self, serializer):
        # The serializer's own clash check runs first (fast, friendly message
        # for the common case) but two concurrent requests can both pass it
        # before either commits — the DB-level unique_teacher_per_timeslot
        # constraint is what's actually race-proof; this just translates its
        # violation into the same validation-error shape the frontend expects.
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            raise ValidationError({'teacher': _TEACHER_CLASH_MESSAGE})

    def perform_update(self, serializer):
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            raise ValidationError({'teacher': _TEACHER_CLASH_MESSAGE})
