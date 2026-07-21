from django.contrib import admin

from .models import PickupPoint, Route, RouteFee, TransportAssignment


class PickupPointInline(admin.TabularInline):
    model = PickupPoint
    extra = 0


@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    list_display = ('name', 'vehicle_plate', 'driver_name', 'driver_phone', 'capacity', 'occupied_count', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name', 'vehicle_plate', 'driver_name')
    ordering = ('name',)
    inlines = [PickupPointInline]


@admin.register(RouteFee)
class RouteFeeAdmin(admin.ModelAdmin):
    list_display = ('route', 'academic_year', 'term', 'quarter', 'amount')
    list_filter = ('academic_year', 'term', 'quarter')
    ordering = ('-academic_year', 'route__name')


@admin.register(TransportAssignment)
class TransportAssignmentAdmin(admin.ModelAdmin):
    list_display = ('student', 'route', 'pickup_point', 'academic_year', 'is_active', 'assigned_at')
    list_filter = ('academic_year', 'is_active', 'route')
    search_fields = ('student__first_name', 'student__last_name', 'student__student_id', 'route__name')
    ordering = ('-is_active', 'route__name')
