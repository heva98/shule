"""
Startup validation for the SMS provider configuration.

Runs with `manage.py check` / `runserver` / `migrate`. When SMS_BACKEND is
"notify_africa" and a required credential or the sender ID is missing, this is
a hard Error — the deployment fails loudly instead of silently falling back to
a backend that can't actually send (or sending with an unapproved sender ID).
"""

from django.conf import settings
from django.core.checks import Error, register

_KNOWN = ("noop", "console", "notify_africa")


@register()
def sms_backend_config(app_configs, **kwargs):
    errors = []
    backend = (getattr(settings, "SMS_BACKEND", "noop") or "noop").strip().lower()

    if backend not in _KNOWN:
        errors.append(Error(
            f"SMS_BACKEND={backend!r} is not one of {_KNOWN}.",
            hint="Set SMS_BACKEND to noop, console or notify_africa.",
            id="communications.E001",
        ))
        return errors

    if backend == "notify_africa":
        from .sms_backends import NotifyAfricaBackend
        for reason in NotifyAfricaBackend().config_errors():
            errors.append(Error(
                f'SMS_BACKEND is "notify_africa" but {reason}.',
                hint="Add it to this deployment's .env, or use SMS_BACKEND=noop.",
                id="communications.E002",
            ))
    return errors
