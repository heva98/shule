"""
Feature-module gating.

Each deployment is one school; `ENABLED_MODULES` in that deployment's .env is
the allow-list of optional feature modules that school has switched on. It is
enforced server-side (viewsets, Celery tasks) and surfaced to the SPA via
/api/auth/school-config/ so routes, the sidebar and dashboard widgets can hide
what is off.

Back-compat: if `ENABLED_MODULES` is unset the historical behaviour is kept —
every module is considered enabled. A deployment opts in to gating by listing
modules explicitly.
"""

from django.conf import settings

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
})


def enabled_modules() -> set[str]:
    raw = getattr(settings, "ENABLED_MODULES", None)
    if not raw:
        return set(OPTIONAL_MODULES)
    if isinstance(raw, str):
        raw = raw.split(",")
    return {m.strip().lower() for m in raw if m and m.strip()}


def module_enabled(name: str) -> bool:
    return name.strip().lower() in enabled_modules()
