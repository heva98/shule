from rest_framework import serializers

from shule.utils import TERM_QUARTER_MAP

from .models import PickupPoint, Route, RouteFee, TransportAssignment


class PickupPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = PickupPoint
        fields = ['id', 'route', 'name', 'pickup_time', 'dropoff_time', 'order']


class RouteFeeSerializer(serializers.ModelSerializer):
    term = serializers.SerializerMethodField()

    class Meta:
        model = RouteFee
        fields = ['id', 'route', 'academic_year', 'term', 'quarter', 'amount']
        read_only_fields = ['id']

    def get_term(self, obj):
        return TERM_QUARTER_MAP.get(obj.quarter)

    def validate(self, attrs):
        quarter = attrs.get('quarter', getattr(self.instance, 'quarter', None))
        attrs['term'] = TERM_QUARTER_MAP.get(quarter)
        return attrs


class RouteSerializer(serializers.ModelSerializer):
    occupied_count = serializers.IntegerField(read_only=True)
    available_seats = serializers.IntegerField(read_only=True)
    pickup_points = PickupPointSerializer(many=True, read_only=True)

    class Meta:
        model = Route
        fields = [
            'id', 'name', 'vehicle_plate', 'driver_name', 'driver_phone',
            'capacity', 'is_active', 'occupied_count', 'available_seats', 'pickup_points',
        ]


class TransportAssignmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    route_name = serializers.CharField(source='route.name', read_only=True)
    pickup_point_name = serializers.CharField(source='pickup_point.name', read_only=True, default=None)
    assigned_by_name = serializers.CharField(source='assigned_by.full_name', read_only=True, default=None)

    class Meta:
        model = TransportAssignment
        fields = [
            'id', 'student', 'student_name',
            'route', 'route_name', 'pickup_point', 'pickup_point_name',
            'academic_year', 'assigned_by', 'assigned_by_name',
            'assigned_at', 'is_active', 'vacated_at',
        ]
        read_only_fields = ['id', 'assigned_by', 'assigned_at', 'is_active', 'vacated_at']

    def validate(self, attrs):
        route = attrs.get('route', getattr(self.instance, 'route', None))
        academic_year = attrs.get('academic_year', getattr(self.instance, 'academic_year', None))
        pickup_point = attrs.get('pickup_point', getattr(self.instance, 'pickup_point', None))

        if pickup_point and route and pickup_point.route_id != route.id:
            raise serializers.ValidationError({
                'pickup_point': f'{pickup_point.name} is not a stop on {route.name}.'
            })

        if route and academic_year:
            occupied = TransportAssignment.objects.filter(
                route=route, academic_year=academic_year, is_active=True,
            )
            if self.instance:
                occupied = occupied.exclude(pk=self.instance.pk)
            if occupied.count() >= route.capacity:
                raise serializers.ValidationError({
                    'route': f'{route.name} is at full capacity ({route.capacity} seats).'
                })

        return attrs
