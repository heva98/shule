from django.conf import settings
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Role, SchoolSettings, UserNotification
from .serializers import LoginSerializer, UserSerializer


def _token_pair(user):
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


class LoginView(APIView):
    permission_classes = [AllowAny]
    # Replaces the global anon/user throttle with a much stricter per-IP
    # rate on this one endpoint — see DEFAULT_THROTTLE_RATES['login'].
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        access, refresh = _token_pair(user)
        return Response(
            {
                'access': access,
                'refresh': refresh,
                'user': UserSerializer(user).data,
            }
        )


class LogoutView(APIView):
    """Blacklists the presented refresh token so it can't be used again —
    for revoking a stolen/leaked token or a device the user no longer trusts,
    not just clearing tokens client-side."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh = request.data.get('refresh')
        if not refresh:
            return Response({'detail': 'refresh is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            RefreshToken(refresh).blacklist()
        except TokenError:
            return Response(
                {'detail': 'Invalid or already-invalidated refresh token.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class NotificationsView(APIView):
    """
    GET  /api/auth/notifications/           — list current user's notifications
    POST /api/auth/notifications/mark-read/ — mark all (or specific ids) as read
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = UserNotification.objects.filter(user=request.user)
        unread_only = request.query_params.get('unread') == 'true'
        if unread_only:
            qs = qs.filter(is_read=False)

        # This endpoint is polled frequently by the notification bell —
        # one aggregate query for both counts instead of two separate
        # .count() calls on top of the row fetch below.
        counts = qs.aggregate(
            total=Count('id'),
            unread=Count('id', filter=Q(is_read=False)),
        )

        data = [
            {
                'id':         n.id,
                'title':      n.title,
                'message':    n.message,
                'category':   n.category,
                'is_read':    n.is_read,
                'created_at': n.created_at.isoformat(),
            }
            for n in qs[:50]
        ]
        return Response({
            'count':        counts['total'],
            'unread_count': counts['unread'],
            'results':      data,
        })

    def post(self, request):
        ids = request.data.get('ids')
        qs  = UserNotification.objects.filter(user=request.user)
        if ids and isinstance(ids, list):
            qs = qs.filter(id__in=ids)
        updated = qs.update(is_read=True)
        return Response({'marked_read': updated})


class SchoolConfigView(APIView):
    """Public school configuration — accessible to all authenticated users."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from shule.modules import enabled_modules

        s = SchoolSettings.get_settings()
        return Response({
            'school_name':   s.school_name,
            'school_logo':   request.build_absolute_uri(s.school_logo.url) if s.school_logo else None,
            'active_levels': s.active_levels or [],
            # Optional feature modules switched on for this deployment — the SPA
            # hides routes / sidebar entries for anything not listed.
            'enabled_modules': sorted(enabled_modules()),
        })


class ModuleConfigView(APIView):
    """
    Which optional modules are enabled for this deployment. Fetched once at
    frontend boot to filter the nav and guard routes — not gated behind a
    module flag itself, since the frontend needs it to know what to hide.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'enabled_modules': settings.ENABLED_MODULES})


class DashboardSummaryView(APIView):
    """
    GET /api/dashboard/summary/
    Everything the Owner/Headteacher/Bursar dashboard (DashboardPage.jsx)
    needs in one round trip, instead of the 7 separate parallel requests it
    used to fire on every load (students, staff, exams, fee summary,
    attendance, defaulters, monthly revenue). Each section is computed with
    the same query the standalone endpoint uses (see fees.views /
    attendance.views helpers) and omitted (null) when its module is off, so
    behaviour matches what the individual endpoints already returned.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = request.user.role
        if role not in {Role.OWNER, Role.HEADTEACHER, Role.BURSAR}:
            raise PermissionDenied('This dashboard summary is for Owner, Headteacher, or Bursar.')

        from django.utils import timezone as tz

        from attendance.views import daily_summary_data
        from exams.models import Exam
        from fees.views import (
            defaulters_queryset,
            fee_summary_data,
            monthly_revenue_data,
            serialize_defaulter,
        )
        from staff.models import StaffProfile
        from students.models import Student, StudentStatus

        enabled = settings.ENABLED_MODULES

        data = {
            'students': {
                'count': Student.objects.filter(status=StudentStatus.ACTIVE).count(),
            },
            'staff': None,
            'exams': None,
            'fees': None,
            'attendance': None,
            'defaulters': None,
            'monthly_revenue': None,
        }

        if role in {Role.OWNER, Role.HEADTEACHER}:
            data['staff'] = {'count': StaffProfile.objects.count()}

        if 'exams' in enabled:
            today = tz.localdate()
            exam_qs = Exam.objects.filter(end_date__gte=today).order_by('start_date', 'id')
            data['exams'] = {
                'upcoming_count': exam_qs.count(),
                'upcoming': [
                    {
                        'id': e.id,
                        'name': e.name,
                        'level': e.level,
                        'stream': e.stream,
                        'exam_type': e.exam_type,
                        'start_date': str(e.start_date),
                    }
                    for e in exam_qs[:5]
                ],
            }

        if 'fees' in enabled:
            data['fees'] = fee_summary_data(term='current')
            data['monthly_revenue'] = monthly_revenue_data(tz.now().year)
            data['defaulters'] = [
                serialize_defaulter(inv) for inv in defaulters_queryset()[:5]
            ]

        if 'attendance' in enabled:
            data['attendance'] = daily_summary_data(str(tz.localdate()))

        return Response(data)
