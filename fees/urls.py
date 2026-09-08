from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AcademicYearViewSet,
    ActivityFeePlanViewSet,
    DefaultersView,
    FeeConfigResolveView,
    FeeMonthlyView,
    FeeStructureViewSet,
    FeeSummaryView,
    InvoiceViewSet,
    LunchFeeConfigViewSet,
    PaymentViewSet,
    TuitionFeePlanViewSet,
    UniformFeePlanViewSet,
)

router = DefaultRouter()
router.register(r'academic-years', AcademicYearViewSet, basename='academic-year')
router.register(r'structures', FeeStructureViewSet, basename='fee-structure')
router.register(r'config/tuition', TuitionFeePlanViewSet, basename='tuition-plan')
router.register(r'config/uniform', UniformFeePlanViewSet, basename='uniform-plan')
router.register(r'config/lunch', LunchFeeConfigViewSet, basename='lunch-config')
router.register(r'config/activity', ActivityFeePlanViewSet, basename='activity-plan')
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'payments', PaymentViewSet, basename='payment')

urlpatterns = [
    path('', include(router.urls)),
    path('config/resolve/', FeeConfigResolveView.as_view(), name='fee-config-resolve'),
    path('defaulters/', DefaultersView.as_view(), name='fee-defaulters'),
    path('summary/monthly/', FeeMonthlyView.as_view(), name='fee-summary-monthly'),
    path('summary/', FeeSummaryView.as_view(), name='fee-summary'),
]
