from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet
from rest_framework_simplejwt.tokens import RefreshToken

from .models import UserNotification
from .serializers import LoginSerializer, RegisterSerializer, UserSerializer


def _token_pair(user):
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        access, refresh = _token_pair(user)
        return Response(
            {
                'access': access,
                'refresh': refresh,
                'user': UserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
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
