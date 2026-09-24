from django.db import models


def normalize_stream(value):
    """Streams are stored and compared in UPPERCASE with no surrounding space."""
    if value is None:
        return value
    return str(value).strip().upper()


class StreamField(models.CharField):
    """
    A class stream name (e.g. "A", "BLUE"). Normalised to uppercase on every
    write — save(), bulk_create() and queryset.update() — and on lookups, so
    `filter(stream='a')` matches rows stored as 'A'. Which names are allowed is
    governed by the `students.Stream` list, enforced at the API layer.
    """

    def __init__(self, *args, **kwargs):
        kwargs.setdefault('max_length', 10)
        super().__init__(*args, **kwargs)

    def pre_save(self, model_instance, add):
        value = normalize_stream(getattr(model_instance, self.attname))
        setattr(model_instance, self.attname, value)
        return value

    def get_prep_value(self, value):
        return normalize_stream(super().get_prep_value(value))
