from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BookViewSet, BorrowRecordViewSet

router = DefaultRouter()
router.register(r'books', BookViewSet, basename='book')
router.register(r'borrow-records', BorrowRecordViewSet, basename='borrow-record')

urlpatterns = [
    path('', include(router.urls)),
]
