from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

# ── Admin branding ────────────────────────────────────────────────────────────
admin.site.site_header = "Shule SMS"
admin.site.site_title = "Shule Admin"
admin.site.index_title = "School Management Panel"

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/',           include('accounts.urls')),
    path('api/students/',       include('students.urls')),
    path('api/fees/',           include('fees.urls')),
    path('api/attendance/',     include('attendance.urls')),
    path('api/exams/',          include('exams.urls')),
    path('api/staff/',          include('staff.urls')),
    path('api/communications/', include('communications.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
