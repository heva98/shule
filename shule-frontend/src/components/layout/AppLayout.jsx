import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import QuickSearch from './QuickSearch'
import NotificationBell from './NotificationBell'
import UserMenu from './UserMenu'

const PATH_TITLES = {
  '/dashboard': 'Dashboard',
  '/students': 'Students',
  '/students/new': 'New Student',
  '/fees': 'Invoices',
  '/fees/student': 'Student Fees',
  '/fees/reports': 'Fee Reports',
  '/fees/defaulters': 'Defaulters',
  '/fees/config': 'Fee Configuration',
  '/fees/academic-years': 'Academic Years',
  '/fees/invoices': 'Invoices',
  '/fees/payments/new': 'Record Payment',
  '/attendance': 'Attendance',
  '/exams': 'Exams',
  '/staff': 'Staff',
  '/analytics': 'Analytics',
  '/communications': 'Communications',
  '/parent': 'Parent Portal',
  '/admin-panel': 'System Dashboard',
  '/admin-panel/users': 'User Management',
  '/admin-panel/roles': 'Role Assignment',
  '/admin-panel/subjects': 'Subjects & Classes',
  '/admin-panel/academic-years': 'Academic Year Setup',
  '/admin-panel/settings': 'School Settings',
  '/admin-panel/modules': 'Modules',
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

// Shown only inside the content region while a lazy module chunk downloads —
// the sidebar and topbar stay put so navigation never blanks the whole screen.
function ContentFallback() {
  return (
    <>
      <div className="route-loading-bar" />
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    </>
  )
}

const COLLAPSE_KEY = 'shule.sidebarCollapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const { pathname } = useLocation()
  const title = resolveTitle(pathname)
  const mainRef = useRef(null)

  // Reset scroll to the top of the content area on every route change so a new
  // module never opens scrolled halfway down where the previous page was left.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        /* storage unavailable — collapse state just won't persist */
      }
      return next
    })
  }

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar collapsed={collapsed} onExpand={toggleCollapsed} />
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
        <header className="flex items-center justify-between h-14 px-4 bg-white border-b border-gray-100 shadow-[0_1px_8px_rgba(69,65,78,0.06)] shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-1.5 rounded-md hover:bg-gray-100 transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} className="text-gray-600" />
            </button>
            <button
              className="hidden lg:inline-flex p-1.5 rounded-md hover:bg-gray-100 transition-colors"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed
                ? <PanelLeftOpen size={20} className="text-gray-600" />
                : <PanelLeftClose size={20} className="text-gray-600" />}
            </button>
            <h1 className="text-base font-semibold text-ink">{title}</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <QuickSearch />
            <NotificationBell />
            <div className="w-px h-6 bg-gray-200 hidden sm:block" />
            <UserMenu />
          </div>
        </header>

        {/* Page content */}
        <main ref={mainRef} className="relative flex-1 overflow-y-auto p-4 md:p-6">
          {/* Keyed so React remounts on module change → fade-in runs each time.
              Suspense sits here (not around the whole app) so only this region
              shows the loader while a module's chunk downloads. */}
          <div key={pathname} className="route-transition">
            <Suspense fallback={<ContentFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
