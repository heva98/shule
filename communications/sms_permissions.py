"""
SMS endpoint permissions.

Every SMS endpoint requires the `sms` module to be enabled for the deployment.
On top of that:
  * exam results  — class teacher (their own class only, enforced in the view)
                    or senior staff (Owner / Headteacher / Academic Teacher)
  * fee reminders — Owner / Headteacher / Bursar, and the `fees` module on
  * announcements — Owner / Headteacher / Bursar
  * delivery log  — senior staff + Bursar see everything; a class teacher sees
                    only the batches they created (queryset-scoped in the view)
"""

from rest_framework.permissions import BasePermission

from accounts.models import Role
from shule.modules import module_enabled

SENIOR_STAFF = {Role.OWNER, Role.HEADTEACHER, Role.ACADEMIC_TEACHER}
RESULT_SENDERS = SENIOR_STAFF | {Role.CLASS_TEACHER}
FEE_SENDERS = {Role.OWNER, Role.HEADTEACHER, Role.BURSAR}
ANNOUNCE_SENDERS = {Role.OWNER, Role.HEADTEACHER, Role.BURSAR}
LOG_VIEWERS = SENIOR_STAFF | {Role.BURSAR, Role.CLASS_TEACHER}


class SmsModuleEnabled(BasePermission):
    message = "The SMS module is not enabled for this school."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated) and module_enabled("sms")


class _RoleGate(BasePermission):
    roles: set = set()
    message = "You do not have permission to use this feature."

    def has_permission(self, request, view):
        return (
            request.user and request.user.is_authenticated
            and module_enabled("sms")
            and request.user.role in self.roles
        )


class CanSendExamResults(_RoleGate):
    roles = RESULT_SENDERS
    message = "Only class teachers and senior staff can send exam-result SMS."


class CanSendFeeReminders(_RoleGate):
    roles = FEE_SENDERS
    message = "Only the Headteacher, Owner or Bursar can send fee-reminder SMS."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and module_enabled("fees")


class CanSendAnnouncements(_RoleGate):
    roles = ANNOUNCE_SENDERS
    message = "Only the Headteacher, Owner or Bursar can send announcement SMS."


class CanConfigureSms(_RoleGate):
    roles = {Role.OWNER, Role.HEADTEACHER}
    message = "Only the Headteacher or Owner can change SMS settings."


class CanViewSmsLog(_RoleGate):
    roles = LOG_VIEWERS
