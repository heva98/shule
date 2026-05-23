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
router.register(r'academic-years', AcademicYearViewSet, basename='academic-year')
router.register(r'structures', FeeStructureViewSet, basename='fee-structure')
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'payments', PaymentViewSet, basename='payment')

urlpatterns = [
    path('', include(router.urls)),
    path('defaulters/', DefaultersView.as_view(), name='fee-defaulters'),
    path('summary/', FeeSummaryView.as_view(), name='fee-summary'),
]
