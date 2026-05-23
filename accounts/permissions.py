from rest_framework.permissions import BasePermission

from .models import Role


class IsOwner(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.OWNER


class IsHeadteacher(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.HEADTEACHER


class IsTeacher(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.TEACHER


class IsBursar(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.BURSAR


class IsParent(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.PARENT
