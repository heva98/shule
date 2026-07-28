import { lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import LoginPage from './pages/auth/LoginPage'
import LandingPage from './pages/LandingPage'
import UnauthorizedPage from './pages/UnauthorizedPage'
import { FEATURE_ROLES } from './lib/constants'

// Every in-app page is code-split so a first-time visitor (or a teacher who
// only ever opens /attendance) doesn't pay for the admin panel, PDF export
// (jspdf), and charting (recharts) bundles pulled in by pages they never
// visit. Only the public/auth shell above is loaded eagerly.
const DashboardRouter = lazy(() => import('./pages/dashboard/DashboardRouter'))
const StudentsListPage = lazy(() => import('./pages/students/StudentsListPage'))
const StudentFormPage = lazy(() => import('./pages/students/StudentFormPage'))
const StudentDetailPage = lazy(() => import('./pages/students/StudentDetailPage'))
const FeesPage = lazy(() => import('./pages/fees/FeesPage'))
const InvoicesPage = lazy(() => import('./pages/fees/InvoicesPage'))
const RecordPaymentPage = lazy(() => import('./pages/fees/RecordPaymentPage'))
const AttendancePage = lazy(() => import('./pages/attendance/AttendancePage'))
const TimetablePage = lazy(() => import('./pages/timetable/TimetablePage'))
const TransportPage = lazy(() => import('./pages/transport/TransportPage'))
const BoardingPage = lazy(() => import('./pages/boarding/BoardingPage'))
const LibraryPage = lazy(() => import('./pages/library/LibraryPage'))
const HomePackagesPage = lazy(() => import('./pages/homepackages/HomePackagesPage'))
const ExamsPage = lazy(() => import('./pages/exams/ExamsPage'))
const MarkEntryPage = lazy(() => import('./pages/exams/MarkEntryPage'))
const ResultsPage = lazy(() => import('./pages/exams/ResultsPage'))
const StaffPage = lazy(() => import('./pages/staff/StaffPage'))
const CommunicationsPage = lazy(() => import('./pages/communications/CommunicationsPage'))
const SchoolCalendarPage = lazy(() => import('./pages/calendar/SchoolCalendarPage'))
const ParentPortalPage = lazy(() => import('./pages/parent/ParentPortalPage'))
const SysAdminDashboard = lazy(() => import('./pages/sysadmin/SysAdminDashboard'))
const UserManagementPage = lazy(() => import('./pages/sysadmin/UserManagementPage'))
const RoleAssignmentPage = lazy(() => import('./pages/sysadmin/RoleAssignmentPage'))
const SubjectsPage = lazy(() => import('./pages/sysadmin/SubjectsPage'))
const AcademicYearPage = lazy(() => import('./pages/sysadmin/AcademicYearPage'))
const SchoolSettingsPage = lazy(() => import('./pages/sysadmin/SchoolSettingsPage'))
const AuditLogPage = lazy(() => import('./pages/sysadmin/AuditLogPage'))
const SystemHealthPage = lazy(() => import('./pages/sysadmin/SystemHealthPage'))

const queryClient = new QueryClient()

const ADMIN_ROLES = FEATURE_ROLES.ADMIN

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
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
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.DASHBOARD}>
                      <DashboardRouter />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/students"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.STUDENTS}>
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
                  path="/students/:id/edit"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER',
                      'CLASS_TEACHER', 'SUBJECT_TEACHER', 'DISCIPLINE_TEACHER']}>
                      <StudentFormPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/students/:id"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.STUDENTS}>
                      <StudentDetailPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/fees"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.FEES}>
                      <FeesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/fees/invoices"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.FEES}>
                      <InvoicesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/fees/payments/new"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.FEES}>
                      <RecordPaymentPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/attendance"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.ATTENDANCE}>
                      <AttendancePage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/timetable"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.TIMETABLE}>
                      <TimetablePage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/transport"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.TRANSPORT}>
                      <TransportPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/boarding"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.BOARDING}>
                      <BoardingPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/library"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.LIBRARY}>
                      <LibraryPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/home-packages"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.HOME_PACKAGES}>
                      <HomePackagesPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/exams"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.EXAMS}>
                      <ExamsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/exams/:id/marks"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.EXAMS}>
                      <MarkEntryPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/exams/:id/results"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.EXAMS}>
                      <ResultsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/staff"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.STAFF}>
                      <StaffPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/communications"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.COMMUNICATIONS}>
                      <CommunicationsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/school-calendar"
                  element={
                    <ProtectedRoute allowedRoles={FEATURE_ROLES.SCHOOL_CALENDAR}>
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
                <ProtectedRoute allowedRoles={FEATURE_ROLES.PARENT}>
                  <ParentPortalPage />
                </ProtectedRoute>
              }
            />
          </Routes>
          </Suspense>

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
