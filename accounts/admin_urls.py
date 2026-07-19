from django.urls import path

from .admin_views import (
    AdminAcademicYearDetailView,
    AdminAcademicYearListView,
    AdminAcademicYearSetCurrentView,
    AdminAuditLogView,
    AdminBulkImportView,
    AdminSettingsView,
    AdminSubjectDetailView,
    AdminSubjectListView,
    AdminSystemHealthView,
    AdminUserDetailView,
    AdminUserListView,
    AdminUserPasswordResetView,
    AdminUserRoleView,
    AdminUserToggleActiveView,
    SchoolCalendarEventDetailView,
    SchoolCalendarEventListView,
)

urlpatterns = [
    # Users
    path('users/',                         AdminUserListView.as_view(),           name='admin-users'),
    path('users/bulk-import/',             AdminBulkImportView.as_view(),         name='admin-bulk-import'),
    path('users/<int:pk>/',                AdminUserDetailView.as_view(),         name='admin-user-detail'),
    path('users/<int:pk>/role/',           AdminUserRoleView.as_view(),           name='admin-user-role'),
    path('users/<int:pk>/reset-password/', AdminUserPasswordResetView.as_view(),  name='admin-user-reset-password'),
    path('users/<int:pk>/toggle-active/',  AdminUserToggleActiveView.as_view(),   name='admin-user-toggle-active'),

    # Audit logs
    path('audit-logs/',                    AdminAuditLogView.as_view(),           name='admin-audit-logs'),

    # School settings
    path('settings/',                      AdminSettingsView.as_view(),           name='admin-settings'),

    # Subjects
    path('subjects/',                      AdminSubjectListView.as_view(),        name='admin-subjects'),
    path('subjects/<int:pk>/',             AdminSubjectDetailView.as_view(),      name='admin-subject-detail'),

    # Academic years
    path('academic-years/',                AdminAcademicYearListView.as_view(),   name='admin-academic-years'),
    path('academic-years/<int:pk>/',       AdminAcademicYearDetailView.as_view(), name='admin-academic-year-detail'),
    path('academic-years/<int:pk>/set-current/', AdminAcademicYearSetCurrentView.as_view(), name='admin-year-set-current'),

    # School calendar events
    path('school-calendar/',              SchoolCalendarEventListView.as_view(),   name='school-calendar-events'),
    path('school-calendar/<int:pk>/',     SchoolCalendarEventDetailView.as_view(), name='school-calendar-event-detail'),

    # System health
    path('system-health/',                 AdminSystemHealthView.as_view(),       name='admin-system-health'),
]
