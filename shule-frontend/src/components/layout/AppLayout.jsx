import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Sidebar from './Sidebar'

const PATH_TITLES = {
  '/dashboard': 'Dashboard',
  '/students': 'Students',
  '/students/new': 'New Student',
  '/fees': 'Fees',
  '/fees/invoices': 'Invoices',
  '/fees/payments/new': 'Record Payment',
  '/attendance': 'Attendance',
  '/exams': 'Exams',
  '/staff': 'Staff',
  '/communications': 'Communications',
  '/parent': 'Parent Portal',
  '/admin-panel': 'System Dashboard',
  '/admin-panel/users': 'User Management',
  '/admin-panel/roles': 'Role Assignment',
  '/admin-panel/subjects': 'Subjects & Classes',
  '/admin-panel/academic-years': 'Academic Year Setup',
  '/admin-panel/settings': 'School Settings',
  '/admin-panel/audit-logs': 'Audit Logs',
  '/admin-panel/system-health': 'System Health',
}

function resolveTitle(pathname) {
  if (PATH_TITLES[pathname]) return PATH_TITLES[pathname]
  const match = Object.entries(PATH_TITLES)
    .filter(([p]) => pathname.startsWith(p))
    .sort((a, b) => b[0].length - a[0].length)[0]
  return match?.[1] ?? 'Shule SMS'
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useAuth()
  const { pathname } = useLocation()
  const title = resolveTitle(pathname)

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 z-50 flex">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between h-14 px-4 bg-white border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-1.5 rounded-md hover:bg-gray-100 transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} className="text-gray-600" />
            </button>
            <h1 className="text-base font-semibold text-gray-800">{title}</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold">
              {user?.full_name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <span className="hidden sm:block text-sm text-gray-700">
              {user?.full_name}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
