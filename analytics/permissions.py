"""
Analytics access control (ANALYTICS_PLAN.md §6.6, decision D13).

Every metric belongs to a *role group*. A group lists the roles allowed to
see its metrics and the optional modules that must be switched on for it to
exist at all. `IsAnalyticsStaff` admits the union of the group roles; the
registry then narrows what each caller sees to their own groups.
"""
from rest_framework.permissions import BasePermission

from accounts.models import Role
from shule.modules import module_enabled


class MetricGroup:
    ENROLMENT = 'enrolment'
    ACADEMICS = 'academics'
    FEES = 'fees'
    SMS = 'sms'


GROUP_LABELS = {
    MetricGroup.ENROLMENT: 'Enrolment',
    MetricGroup.ACADEMICS: 'Academics',
    MetricGroup.FEES: 'Fees',
    MetricGroup.SMS: 'SMS',
}

ROLE_GROUPS: dict[str, frozenset[str]] = {
    MetricGroup.ENROLMENT: frozenset({
        Role.OWNER, Role.SYSTEM_ADMIN, Role.HEADTEACHER, Role.ACADEMIC_TEACHER,
        Role.BURSAR, Role.CLASS_TEACHER,
    }),
    MetricGroup.ACADEMICS: frozenset({
        Role.OWNER, Role.SYSTEM_ADMIN, Role.HEADTEACHER, Role.ACADEMIC_TEACHER,
        Role.CLASS_TEACHER,
    }),
    MetricGroup.FEES: frozenset({
        Role.OWNER, Role.SYSTEM_ADMIN, Role.HEADTEACHER, Role.BURSAR,
    }),
    MetricGroup.SMS: frozenset({
        Role.OWNER, Role.SYSTEM_ADMIN, Role.HEADTEACHER,
    }),
}

# Optional modules a group needs (§4.5). Enrolment is core; academics needs
# both exams and reports (D19).
GROUP_MODULES: dict[str, tuple[str, ...]] = {
    MetricGroup.ENROLMENT: (),
    MetricGroup.ACADEMICS: ('exams', 'reports'),
    MetricGroup.FEES: ('fees',),
    MetricGroup.SMS: ('sms',),
}

ANALYTICS_ROLES = frozenset().union(*ROLE_GROUPS.values())


def modules_enabled(modules) -> bool:
    return all(module_enabled(m) for m in modules)


def groups_for_role(role) -> list[str]:
    """The metric groups a role may see, among those whose modules are on."""
    return [
        group for group, roles in ROLE_GROUPS.items()
        if role in roles and modules_enabled(GROUP_MODULES[group])
    ]


class IsAnalyticsStaff(BasePermission):
    """Staff in at least one analytics role group. Parents, students and the
    non-analytics teaching roles never reach an analytics endpoint."""

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in ANALYTICS_ROLES
        )
