from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AcademicYearViewSet,
    DefaultersView,
    FeeStructureViewSet,
    FeeSummaryView,
    InvoiceViewSet,
    PaymentViewSet,
)

router = DefaultRouter()
router.register(r'fees/academic-years', AcademicYearViewSet, basename='academic-year')
router.register(r'fees/structures', FeeStructureViewSet, basename='fee-structure')
router.register(r'fees/invoices', InvoiceViewSet, basename='invoice')
router.register(r'fees/payments', PaymentViewSet, basename='payment')

urlpatterns = [
    path('', include(router.urls)),
    path('fees/defaulters/', DefaultersView.as_view(), name='fee-defaulters'),
    path('fees/summary/', FeeSummaryView.as_view(), name='fee-summary'),
]
