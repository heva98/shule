from django.conf import settings
from django.db import models


class VisualizationType(models.TextChoices):
    """Mirrors `VISUALIZATION_TYPES` in the SPA's visualizationConfig.js."""
    PIVOT_TABLE = 'PIVOT_TABLE', 'Pivot table'
    COLUMN = 'COLUMN', 'Column chart'
    STACKED_COLUMN = 'STACKED_COLUMN', 'Stacked column chart'
    BAR = 'BAR', 'Bar chart'
    LINE = 'LINE', 'Line chart'
    PIE = 'PIE', 'Pie chart'
    SINGLE_VALUE = 'SINGLE_VALUE', 'Single value'


class SavedVisualization(models.Model):
    """A named analytics visualization: the SPA's whole visualization config
    (layout, selected items, options), stored as-is so it can be reopened or
    drawn as a dashboard widget. It holds no data; every view re-runs the
    query as the viewer, so role and module filtering still apply."""
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    # Denormalised from `config['type']` (the serializer keeps them in step)
    # so lists can show and filter by type without reading the JSON.
    type = models.CharField(max_length=20, choices=VisualizationType.choices)
    config = models.JSONField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='saved_visualizations',
    )
    # Other analytics staff may open (and pin, or "save as") it; only the
    # creator may change or delete it.
    shared_with_staff = models.BooleanField(default=False)
    # Users with this visualization pinned to their dashboard.
    pinned_by = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name='pinned_visualizations',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'id']

    def __str__(self):
        return self.name
