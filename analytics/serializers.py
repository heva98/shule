import json

from rest_framework import serializers

from .models import SavedVisualization, VisualizationType
from .registry import unavailable_references

# A config is a few hundred bytes; this only stops a client storing junk.
MAX_CONFIG_BYTES = 20_000

_AXES = ('columns', 'rows', 'filters')


def _is_str_list(value):
    return isinstance(value, list) and all(isinstance(v, str) for v in value)


def validate_config(config):
    """Shape check for the SPA's visualization config (visualizationConfig.js).
    Meaning (which metrics exist, what the caller may see) is checked
    against the registry separately."""
    if not isinstance(config, dict):
        raise serializers.ValidationError('Must be an object.')
    if len(json.dumps(config)) > MAX_CONFIG_BYTES:
        raise serializers.ValidationError('Too large.')
    if config.get('type') not in VisualizationType.values:
        raise serializers.ValidationError('Unknown visualization type.')
    for axis in _AXES:
        if not _is_str_list(config.get(axis)):
            raise serializers.ValidationError(f'`{axis}` must be a list of dimension ids.')
    placed = [d for axis in _AXES for d in config[axis]]
    if len(placed) != len(set(placed)):
        raise serializers.ValidationError('A dimension may appear on only one axis.')
    items = config.get('items')
    if not isinstance(items, dict) or not all(_is_str_list(v) for v in items.values()):
        raise serializers.ValidationError('`items` must map dimension ids to lists of item ids.')
    if not isinstance(config.get('options', {}), dict):
        raise serializers.ValidationError('`options` must be an object.')
    return config


class SavedVisualizationSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    is_owner = serializers.SerializerMethodField()
    is_pinned = serializers.SerializerMethodField()
    unavailable = serializers.SerializerMethodField()

    class Meta:
        model = SavedVisualization
        fields = [
            'id', 'name', 'description', 'type', 'config', 'shared_with_staff',
            'created_by', 'created_by_name', 'is_owner', 'is_pinned', 'unavailable',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['type', 'created_by', 'created_at', 'updated_at']

    def _user(self):
        return self.context['request'].user

    def get_is_owner(self, obj):
        return obj.created_by_id == self._user().id

    def get_is_pinned(self, obj):
        # Annotated by the viewset's queryset; a freshly created row has none.
        return bool(getattr(obj, 'is_pinned', False))

    def get_unavailable(self, obj):
        return unavailable_references(obj.config, self._user().role)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Give the visualization a name.')
        return value

    def validate_config(self, value):
        validate_config(value)
        problems = unavailable_references(value, self._user().role)
        if problems:
            names = ', '.join(p['label'] for p in problems)
            raise serializers.ValidationError(f'Uses data you cannot query: {names}.')
        return value

    def validate(self, attrs):
        if 'config' in attrs:
            attrs['type'] = attrs['config']['type']
        return attrs
