from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .models import SchoolSettings, UserNotification
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
            'count':       qs.count(),
            'unread_count': qs.filter(is_read=False).count(),
            'results':     data,
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
        s = SchoolSettings.get_settings()
        return Response({
            'school_name':   s.school_name,
            'school_logo':   request.build_absolute_uri(s.school_logo.url) if s.school_logo else None,
            'active_levels': s.active_levels or [],
        })
