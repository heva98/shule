"""
Feature-module gating.

Each deployment is one school. Which optional modules it runs comes from two
layers:

* `LICENSED_MODULES` (.env, set at setup): the modules this school may use at
  all. Unset means every optional module.
* The admin's choice (Admin Panel → Modules, stored on
  `accounts.SchoolSettings.enabled_modules`): which licensed modules are
  switched on. Until an admin first saves there, the `ENABLED_MODULES` env
  value (or its default in settings.py) stands in for it.

The enabled set is the admin's choice narrowed to the licence. It is enforced
server-side (`ModuleEnabled` on views, Celery tasks, signals) and sent to the
SPA on the user payload so routes, the sidebar and dashboard widgets hide what
is off. Always read it through `enabled_modules()` / `module_enabled()`, never
`settings.ENABLED_MODULES`, or an admin's change won't take effect.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.cache import cache
from django.db import DatabaseError

logger = logging.getLogger(__name__)

# Optional modules that can be toggled per deployment. Core areas (accounts,
# students) are always on and are intentionally not listed here. Keep this in
# sync with the `requiredModule=` values used by the SPA route guards.
OPTIONAL_MODULES = frozenset({
    "fees",
    "exams",
    "reports",
    "attendance",
    "timetable",
    "staff",
    "communications",
    "sms",
    "boarding",
    "transport",
    "library",
    "homepackages",
    "documents",
    "school_calendar",
    "analytics",
})

# What the Modules admin page shows for each module, in display order.
MODULE_INFO = {
    "fees": ("Fees", "Invoices, payments, fee reports, defaulters and uniform sales."),
    "attendance": ("Attendance", "Daily registers and absence alerts to parents."),
    "exams": ("Exams", "Exams, mark entry and results."),
    "reports": ("Exam reports", "Report cards, performance and subject analysis."),
    "timetable": ("Timetable", "Class and teacher timetables."),
    "school_calendar": ("School calendar", "Term dates, holidays and school events."),
    "staff": ("Staff", "Staff records, class teachers and discipline."),
    "communications": ("Communications", "Announcements and messages to parents and staff."),
    "sms": ("SMS", "Bulk SMS, fee reminders and absence alerts by SMS."),
    "boarding": ("Boarding", "Dormitories and boarders."),
    "transport": ("Transport", "Routes, vehicles and pupils using school transport."),
    "library": ("Library", "Books, loans and returns."),
    "homepackages": ("Home packages", "Holiday work sent home to pupils."),
    "documents": ("Documents", "Student documents such as birth certificates."),
    "analytics": ("Analytics", "Pivot tables and charts across enrolment, exams, fees and SMS."),
}
assert set(MODULE_INFO) == OPTIONAL_MODULES

# A module that is useless without another one.
MODULE_REQUIRES = {
    "reports": ("exams",),
}

# The admin's saved choice, shared across gunicorn workers and Celery through
# the (Redis) cache. Saving clears it; the timeout only bounds staleness if a
# clear is ever missed.
_CACHE_KEY = "shule:admin_enabled_modules:v1"
_CACHE_TIMEOUT = 300


def _normalise(raw) -> set[str]:
    if isinstance(raw, str):
        raw = raw.split(",")
    return {m.strip().lower() for m in raw or () if m and m.strip()}


def licensed_modules() -> set[str]:
    raw = getattr(settings, "LICENSED_MODULES", None)
    if raw is None:
        return set(OPTIONAL_MODULES)
    return _normalise(raw) & OPTIONAL_MODULES


def _env_enabled() -> set[str]:
    raw = getattr(settings, "ENABLED_MODULES", None)
    if raw is None:
        return set(OPTIONAL_MODULES)
    # An explicit empty value means "nothing enabled" (see .env.example).
    return _normalise(raw)


def _read_admin_choice():
    from accounts.models import SchoolSettings

    try:
        value = SchoolSettings.objects.filter(pk=1).values_list("enabled_modules", flat=True).first()
    except DatabaseError:
        # The column doesn't exist yet (mid-migration): behave as unconfigured.
        return None
    return None if value is None else sorted(_normalise(value))


def admin_choice() -> set[str] | None:
    """The modules an admin switched on, or None if no admin has saved yet."""
    try:
        cached = cache.get(_CACHE_KEY)
    except Exception:  # cache backend down: go to the database every time
        logger.warning("Module cache unavailable; reading the database", exc_info=True)
        value = _read_admin_choice()
        return None if value is None else set(value)
    if cached is None:
        # Wrapped so "no admin choice" (None) is cacheable too.
        cached = {"modules": _read_admin_choice()}
        try:
            cache.set(_CACHE_KEY, cached, _CACHE_TIMEOUT)
        except Exception:
            logger.warning("Could not cache the module choice", exc_info=True)
    modules = cached["modules"]
    return None if modules is None else set(modules)


def clear_module_cache() -> None:
    try:
        cache.delete(_CACHE_KEY)
    except Exception:
        logger.warning("Could not clear the module cache", exc_info=True)


def enabled_modules() -> set[str]:
    chosen = admin_choice()
    if chosen is None:
        chosen = _env_enabled()
    return chosen & licensed_modules()


def module_enabled(name: str) -> bool:
    return name.strip().lower() in enabled_modules()
