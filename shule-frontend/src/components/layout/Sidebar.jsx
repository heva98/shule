import {
  Activity,
  BedDouble,
  BookOpen,
  Bus,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Clock,
  CreditCard,
  FileBarChart2,
  GraduationCap,
  Heart,
  HelpCircle,
  LayoutDashboard,
  Library,
  LogOut,
  MessageSquare,
  Monitor,
  Package,
  ScrollText,
  Settings,
  Shield,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { isModuleVisible, useEnabledModules } from '../../hooks/useEnabledModules'
import logo from '../../assets/ShuleSMSLogo.png'
import { FEATURE_ROLES, ROLE_LABEL } from '../../lib/constants'

const ADMIN_ROLES = FEATURE_ROLES.ADMIN

// `module: null` (or omitted) means core — always shown regardless of
// ENABLED_MODULES. Everything else is filtered against it below.
const NAV_ITEMS = [
  { label: 'Dashboard',       path: '/dashboard',      icon: LayoutDashboard, roles: FEATURE_ROLES.DASHBOARD,      module: null },
  { label: 'Students',        path: '/students',       icon: GraduationCap,   roles: FEATURE_ROLES.STUDENTS,       module: null },
  { label: 'Fees',            path: '/fees',           icon: CreditCard,      roles: FEATURE_ROLES.FEES,           module: 'fees' },
  { label: 'Attendance',      path: '/attendance',     icon: CalendarCheck,   roles: FEATURE_ROLES.ATTENDANCE,     module: 'attendance' },
  { label: 'Timetable',       path: '/timetable',      icon: Clock,           roles: FEATURE_ROLES.TIMETABLE,      module: 'timetable' },
  { label: 'Boarding',        path: '/boarding',       icon: BedDouble,       roles: FEATURE_ROLES.BOARDING,       module: 'boarding' },
  { label: 'Library',         path: '/library',        icon: Library,         roles: FEATURE_ROLES.LIBRARY,        module: 'library' },
  { label: 'Transport',       path: '/transport',      icon: Bus,             roles: FEATURE_ROLES.TRANSPORT,      module: 'transport' },
  { label: 'Home Packages',   path: '/home-packages',  icon: Package,         roles: FEATURE_ROLES.HOME_PACKAGES,  module: 'homepackages' },
  { label: 'Exams',           path: '/exams',          icon: ClipboardList,   roles: FEATURE_ROLES.EXAMS,          module: 'exams' },
  { label: 'Exam Reports',    path: '/exams/reports',  icon: FileBarChart2,   roles: FEATURE_ROLES.EXAM_REPORTS,   module: 'reports' },
  { label: 'Staff',           path: '/staff',          icon: Users,           roles: FEATURE_ROLES.STAFF,          module: null },
  { label: 'Communications',  path: '/communications', icon: MessageSquare,   roles: FEATURE_ROLES.COMMUNICATIONS, module: 'communications' },
  { label: 'School Calendar', path: '/school-calendar',icon: CalendarRange,   roles: FEATURE_ROLES.SCHOOL_CALENDAR,module: 'school_calendar' },
  { label: 'My Children',     path: '/parent',         icon: Heart,           roles: FEATURE_ROLES.PARENT,         module: null },
]

const ADMIN_NAV_ITEMS = [
  { label: 'System Dashboard',    path: '/admin-panel',                icon: Monitor },
  { label: 'User Management',     path: '/admin-panel/users',          icon: UserCog },
  { label: 'Role Assignment',     path: '/admin-panel/roles',          icon: Shield },
  { label: 'Subjects & Classes',  path: '/admin-panel/subjects',       icon: BookOpen },
  { label: 'Academic Year Setup', path: '/admin-panel/academic-years', icon: CalendarDays },
  { label: 'School Settings',     path: '/admin-panel/settings',       icon: Settings },
  { label: 'Audit Logs',          path: '/admin-panel/audit-logs',     icon: ScrollText },
  { label: 'System Health',       path: '/admin-panel/system-health',  icon: Activity },
]

function NavItem({ item, onClose }) {
  const Icon = item.icon
  return (
    <NavLink
      key={item.path}
      to={item.path}
      end={item.path === '/admin-panel' || item.path === '/dashboard'}
      onClick={onClose}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
          isActive
            ? 'bg-white/20 text-white font-medium'
            : 'text-white/70 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      <Icon size={17} className="shrink-0" />
      <span className="flex-1">{item.label}</span>
    </NavLink>
  )
}

export default function Sidebar({ onClose }) {
  const { user, logout } = useAuth()
  const { enabledModules, modulesLoading } = useEnabledModules()
  const role = user?.role ?? ''
  const isAdmin = ADMIN_ROLES.includes(role)

  const regularItems = NAV_ITEMS.filter(
    item => item.roles.includes(role) && isModuleVisible(item.module, enabledModules, modulesLoading)
  )
  const showAdmin = isAdmin

  return (
    <aside className="flex flex-col h-full bg-primary text-white w-64 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-white/20">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Shule SMS" className="w-9 h-9 rounded-lg object-contain shrink-0 bg-white" />
          <div>
            <div className="font-semibold text-sm leading-tight">Shule SMS</div>
            <div className="text-xs text-white/60">School Management</div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {/* Regular nav */}
        {regularItems.map(item => (
          <NavItem key={item.path} item={item} onClose={onClose} />
        ))}

        {/* Admin nav section */}
        {showAdmin && (
          <>
            {regularItems.length > 0 && (
              <div className="pt-3 pb-1">
                <div className="h-px bg-white/10 mb-3" />
                <p className="px-3 text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-1">
                  Admin Panel
                </p>
              </div>
            )}
            {ADMIN_NAV_ITEMS.map(item => (
              <NavItem key={item.path} item={item} onClose={onClose} />
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/20 px-4 py-4 space-y-3">
        <div>
          <div className="text-sm font-medium truncate">{user?.full_name ?? 'User'}</div>
          <span className="inline-block mt-1 text-[10px] bg-accent/80 text-white px-2 py-0.5 rounded-full">
            {ROLE_LABEL[role] ?? role}
          </span>
        </div>
        <a
          href="/manual"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-white/70 hover:text-white text-sm transition-colors w-full"
        >
          <HelpCircle size={15} />
          User Manual
        </a>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-white/70 hover:text-white text-sm transition-colors w-full"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
