import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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
import UnauthorizedPage from './pages/UnauthorizedPage'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            {/* Protected shell */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />

                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'BURSAR', 'TEACHER']}>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/students"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'TEACHER', 'BURSAR']}>
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
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'TEACHER', 'BURSAR']}>
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
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'TEACHER']}>
                      <AttendancePage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/exams"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'TEACHER']}>
                      <ExamsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/exams/:id/marks"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'TEACHER']}>
                      <MarkEntryPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/exams/:id/results"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER', 'TEACHER']}>
                      <ResultsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/staff"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER']}>
                      <StaffPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/communications"
                  element={
                    <ProtectedRoute allowedRoles={['OWNER', 'HEADTEACHER']}>
                      <CommunicationsPage />
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
