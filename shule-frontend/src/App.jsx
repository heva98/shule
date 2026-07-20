import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import AttendancePage from './pages/attendance/AttendancePage'
import CommunicationsPage from './pages/communications/CommunicationsPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import ExamsPage from './pages/exams/ExamsPage'
import MarkEntryPage from './pages/exams/MarkEntryPage'
import ResultsPage from './pages/exams/ResultsPage'
import FeesPage from './pages/fees/FeesPage'
import InvoicesPage from './pages/fees/InvoicesPage'
import RecordPaymentPage from './pages/fees/RecordPaymentPage'
import ParentPortalPage from './pages/parent/ParentPortalPage'
import StaffPage from './pages/staff/StaffPage'
import StudentDetailPage from './pages/students/StudentDetailPage'
import StudentFormPage from './pages/students/StudentFormPage'
import StudentsListPage from './pages/students/StudentsListPage'
import LoginPage from './pages/auth/LoginPage'
import LandingPage from './pages/LandingPage'
import UnauthorizedPage from './pages/UnauthorizedPage'
import SysAdminDashboard from './pages/sysadmin/SysAdminDashboard'
import UserManagementPage from './pages/sysadmin/UserManagementPage'
import RoleAssignmentPage from './pages/sysadmin/RoleAssignmentPage'
import SubjectsPage from './pages/sysadmin/SubjectsPage'
import AcademicYearPage from './pages/sysadmin/AcademicYearPage'
import SchoolCalendarPage from './pages/calendar/SchoolCalendarPage'
import TimetablePage from './pages/timetable/TimetablePage'
import HomePackagesPage from './pages/homepackages/HomePackagesPage'
import SchoolSettingsPage from './pages/sysadmin/SchoolSettingsPage'
import AuditLogPage from './pages/sysadmin/AuditLogPage'
import SystemHealthPage from './pages/sysadmin/SystemHealthPage'

const queryClient = new QueryClient()

const ADMIN_ROLES = ['OWNER', 'SYSTEM_ADMIN']

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            {/* Protected shell */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'BURSAR', 'TEACHER',
                      'ACADEMIC_TEACHER', 'DISCIPLINE_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER']}>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/students"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'TEACHER', 'BURSAR',
                      'ACADEMIC_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'DISCIPLINE_TEACHER']}>
                      <StudentsListPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/students/new"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER']}>
                      <StudentFormPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/students/:id"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'TEACHER', 'BURSAR',
                      'ACADEMIC_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'DISCIPLINE_TEACHER']}>
                      <StudentDetailPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/fees"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'BURSAR']}>
                      <FeesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/fees/invoices"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'BURSAR']}>
                      <InvoicesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/fees/payments/new"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'BURSAR']}>
                      <RecordPaymentPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/attendance"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'TEACHER', 'ACADEMIC_TEACHER',
                      'CLASS_TEACHER', 'SUBJECT_TEACHER', 'DISCIPLINE_TEACHER']}>
                      <AttendancePage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/timetable"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'TEACHER', 'ACADEMIC_TEACHER',
                      'CLASS_TEACHER', 'SUBJECT_TEACHER', 'DISCIPLINE_TEACHER']}>
                      <TimetablePage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/home-packages"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'TEACHER', 'ACADEMIC_TEACHER',
                      'CLASS_TEACHER', 'SUBJECT_TEACHER', 'DISCIPLINE_TEACHER']}>
                      <HomePackagesPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/exams"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'TEACHER', 'ACADEMIC_TEACHER',
                      'CLASS_TEACHER', 'SUBJECT_TEACHER']}>
                      <ExamsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/exams/:id/marks"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'TEACHER', 'ACADEMIC_TEACHER',
                      'CLASS_TEACHER', 'SUBJECT_TEACHER']}>
                      <MarkEntryPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/exams/:id/results"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'TEACHER', 'ACADEMIC_TEACHER',
                      'CLASS_TEACHER', 'SUBJECT_TEACHER']}>
                      <ResultsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/staff"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER']}>
                      <StaffPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/communications"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER']}>
                      <CommunicationsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/school-calendar"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'SYSTEM_ADMIN', 'HEADTEACHER', 'ACADEMIC_TEACHER',
                      'DISCIPLINE_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'TEACHER', 'BURSAR']}>
                      <SchoolCalendarPage />
                    </ProtectedRoute>
                  }
                />

                {/* ── Admin Panel ─────────────────────────────────────── */}
                <Route
                  path="/admin-panel"
                  element={
                    <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                      <SysAdminDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin-panel/users"
                  element={
                    <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                      <UserManagementPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin-panel/roles"
                  element={
                    <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                      <RoleAssignmentPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin-panel/subjects"
                  element={
                    <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                      <SubjectsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin-panel/academic-years"
                  element={
                    <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                      <AcademicYearPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin-panel/settings"
                  element={
                    <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                      <SchoolSettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin-panel/audit-logs"
                  element={
                    <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                      <AuditLogPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin-panel/system-health"
                  element={
                    <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                      <SystemHealthPage />
                    </ProtectedRoute>
                  }
                />

              </Route>
            </Route>

            {/* Parent portal — standalone layout, no sidebar */}
            <Route
              path="/parent"
              element={
                <ProtectedRoute allowedRoles={['PARENT']}>
                  <ParentPortalPage />
                </ProtectedRoute>
              }
            />
          </Routes>

          <Toaster
            position="top-right"
            toastOptions={{
              success: { className: '!text-sm' },
              error: { className: '!text-sm' },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
