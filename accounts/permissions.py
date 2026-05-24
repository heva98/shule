from rest_framework.permissions import BasePermission

from .models import Role


class IsSystemAdmin(BasePermission):
    """SYSTEM_ADMIN or OWNER — full admin panel access."""
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in (Role.SYSTEM_ADMIN, Role.OWNER)
        )


class IsOwner(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.OWNER


class IsHeadteacher(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.HEADTEACHER


class IsAcademicTeacher(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.ACADEMIC_TEACHER


class IsDisciplineTeacher(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.DISCIPLINE_TEACHER


class IsClassTeacher(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.CLASS_TEACHER


class IsSubjectTeacher(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.SUBJECT_TEACHER


class IsTeacher(BasePermission):
    """Legacy: matches old TEACHER role only."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.TEACHER


class IsBursar(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.BURSAR


class IsParent(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.PARENT


class IsAcademicStaff(BasePermission):
    """Any teaching / academic role — for shared academic views."""
    ACADEMIC_ROLES = {
        Role.OWNER, Role.HEADTEACHER, Role.ACADEMIC_TEACHER,
        Role.DISCIPLINE_TEACHER, Role.CLASS_TEACHER,
        Role.SUBJECT_TEACHER, Role.TEACHER,
    }

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in self.ACADEMIC_ROLES
        )


class IsSeniorStaff(BasePermission):
    """Owner, Headteacher, or Academic Teacher — can manage exams and assignments."""
    SENIOR_ROLES = {Role.OWNER, Role.HEADTEACHER, Role.ACADEMIC_TEACHER}

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in self.SENIOR_ROLES
        )
