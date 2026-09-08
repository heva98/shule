from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AcademicYearViewSet,
    ActivityFeePlanViewSet,
    ChargeGenerateView,
    DefaultersView,
    FeeCollectionsReport,
    FeeConfigResolveView,
    FeeMonthlyView,
    FeeOutstandingReport,
    FeeOverviewReport,
    FeeStructureViewSet,
    FeeSummaryView,
    FeeUnpaidStudentsReport,
    InvoiceLineViewSet,
    InvoiceViewSet,
    LunchFeeConfigViewSet,
    PaymentViewSet,
    StudentCreditViewSet,
    StudentFeeSummaryView,
    TuitionFeePlanViewSet,
    UniformAssignView,
    UniformFeePlanViewSet,
    UniformSaleView,
)

router = DefaultRouter()
router.register(r'academic-years', AcademicYearViewSet, basename='academic-year')
router.register(r'structures', FeeStructureViewSet, basename='fee-structure')
router.register(r'config/tuition', TuitionFeePlanViewSet, basename='tuition-plan')
router.register(r'config/uniform', UniformFeePlanViewSet, basename='uniform-plan')
router.register(r'config/lunch', LunchFeeConfigViewSet, basename='lunch-config')
router.register(r'config/activity', ActivityFeePlanViewSet, basename='activity-plan')
router.register(r'invoice-lines', InvoiceLineViewSet, basename='invoice-line')
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'credits', StudentCreditViewSet, basename='student-credit')

urlpatterns = [
    path('', include(router.urls)),
    path('config/resolve/', FeeConfigResolveView.as_view(), name='fee-config-resolve'),
    path('charges/generate/', ChargeGenerateView.as_view(), name='fee-charges-generate'),
    path('charges/assign-uniform/', UniformAssignView.as_view(), name='fee-assign-uniform'),
    path('uniform-sales/', UniformSaleView.as_view(), name='fee-uniform-sale'),
    path('student-summary/', StudentFeeSummaryView.as_view(), name='fee-student-summary'),
    path('reports/collections/', FeeCollectionsReport.as_view(), name='fee-report-collections'),
    path('reports/outstanding/', FeeOutstandingReport.as_view(), name='fee-report-outstanding'),
    path('reports/unpaid/', FeeUnpaidStudentsReport.as_view(), name='fee-report-unpaid'),
    path('reports/overview/', FeeOverviewReport.as_view(), name='fee-report-overview'),
    path('defaulters/', DefaultersView.as_view(), name='fee-defaulters'),
    path('summary/monthly/', FeeMonthlyView.as_view(), name='fee-summary-monthly'),
    path('summary/', FeeSummaryView.as_view(), name='fee-summary'),
]
