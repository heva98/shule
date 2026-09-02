from django.apps import AppConfig


class CommunicationsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'communications'

    def ready(self):
        # Register the SMS provider-config system check.
        from . import checks  # noqa: F401
        # Payment → "thank you" SMS signal (no-op unless the school opts in).
        from . import signals  # noqa: F401
