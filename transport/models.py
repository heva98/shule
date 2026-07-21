from django.conf import settings
from django.db import models

from fees.models import Term, Quarter
from shule.utils import validate_term_quarter


class Route(models.Model):
    """A school bus route."""
    name = models.CharField(max_length=100, unique=True)
    vehicle_plate = models.CharField(max_length=20, blank=True)
    driver_name = models.CharField(max_length=100, blank=True)
    driver_phone = models.CharField(max_length=20, blank=True)
    capacity = models.PositiveIntegerField()
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def occupied_count(self):
        return self.assignments.filter(is_active=True).count()

    @property
    def available_seats(self):
        return self.capacity - self.occupied_count


class PickupPoint(models.Model):
    """A stop along a route."""
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='pickup_points')
    name = models.CharField(max_length=150)
    pickup_time = models.TimeField(null=True, blank=True)
    dropoff_time = models.TimeField(null=True, blank=True)
    order = models.PositiveSmallIntegerField(default=1, help_text='Stop order along the route')

    class Meta:
        ordering = ['route', 'order']
        unique_together = ('route', 'name')

    def __str__(self):
        return f'{self.route.name} — {self.name}'


class RouteFee(models.Model):
    """The transport fee for a route in a given term/quarter — routes can cost different amounts."""
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='fees')
    academic_year = models.ForeignKey(
        'fees.AcademicYear', on_delete=models.PROTECT, related_name='transport_fees'
    )
    term = models.CharField(max_length=10, choices=Term.choices)
    quarter = models.CharField(max_length=5, choices=Quarter.choices)
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ['-academic_year', 'term', 'quarter']
        unique_together = ('route', 'academic_year', 'term', 'quarter')

    def clean(self):
        validate_term_quarter(self.term, self.quarter)

    def __str__(self):
        return f'{self.route.name} — {self.term} {self.quarter} — {self.amount}'


class TransportAssignment(models.Model):
    """A student's subscription to a bus route for a given academic year."""
    student = models.ForeignKey(
        'students.Student', on_delete=models.CASCADE, related_name='transport_assignments'
    )
    route = models.ForeignKey(Route, on_delete=models.PROTECT, related_name='assignments')
    pickup_point = models.ForeignKey(
        PickupPoint, on_delete=models.SET_NULL, null=True, blank=True, related_name='assignments'
    )
    academic_year = models.ForeignKey(
        'fees.AcademicYear', on_delete=models.PROTECT, related_name='transport_assignments'
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='transport_assignments_made'
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    vacated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-is_active', 'route__name']
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'academic_year'],
                condition=models.Q(is_active=True),
                name='unique_active_transport_assignment_per_year',
            )
        ]

    def __str__(self):
        return f'{self.student.full_name} — {self.route.name} ({self.academic_year})'
