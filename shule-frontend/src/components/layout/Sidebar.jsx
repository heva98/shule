import {
  Activity,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Clock,
  CreditCard,
  GraduationCap,
  Heart,
  LayoutDashboard,
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

const ADMIN_ROLES = ['OWNER', 'SYSTEM_ADMIN']

const NAV_ITEMS = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
    roles: ['OWNER', 'HEADTEACHER', 'BURSAR', 'TEACHER', 'ACADEMIC_TEACHER',
            'DISCIPLINE_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER'],
  },
  {
    label: 'Students',
    path: '/students',
    icon: GraduationCap,
    roles: ['OWNER', 'HEADTEACHER', 'TEACHER', 'BURSAR', 'ACADEMIC_TEACHER',
            'CLASS_TEACHER', 'SUBJECT_TEACHER', 'DISCIPLINE_TEACHER'],
  },
  {
    label: 'Fees',
    path: '/fees',
    icon: CreditCard,
    roles: ['OWNER', 'HEADTEACHER', 'BURSAR'],
  },
  {
    label: 'Attendance',
    path: '/attendance',
    icon: CalendarCheck,
    roles: ['OWNER', 'HEADTEACHER', 'TEACHER', 'ACADEMIC_TEACHER',
            'CLASS_TEACHER', 'SUBJECT_TEACHER', 'DISCIPLINE_TEACHER'],
  },
  {
    label: 'Timetable',
    path: '/timetable',
    icon: Clock,
    roles: ['OWNER', 'HEADTEACHER', 'TEACHER', 'ACADEMIC_TEACHER',
            'CLASS_TEACHER', 'SUBJECT_TEACHER', 'DISCIPLINE_TEACHER'],
  },
  {
    label: 'Home Packages',
    path: '/home-packages',
    icon: Package,
    roles: ['OWNER', 'HEADTEACHER', 'TEACHER', 'ACADEMIC_TEACHER',
            'CLASS_TEACHER', 'SUBJECT_TEACHER', 'DISCIPLINE_TEACHER'],
  },
  {
    label: 'Exams',
    path: '/exams',
    icon: ClipboardList,
    roles: ['OWNER', 'HEADTEACHER', 'TEACHER', 'ACADEMIC_TEACHER',
            'CLASS_TEACHER', 'SUBJECT_TEACHER'],
  },
  {
    label: 'Staff',
    path: '/staff',
    icon: Users,
    roles: ['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER'],
  },
  {
    label: 'Communications',
    path: '/communications',
    icon: MessageSquare,
    roles: ['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER'],
  },
  {
    label: 'School Calendar',
    path: '/school-calendar',
    icon: CalendarRange,
    roles: ['OWNER', 'SYSTEM_ADMIN', 'HEADTEACHER', 'ACADEMIC_TEACHER',
            'DISCIPLINE_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'TEACHER', 'BURSAR'],
  },
  {
    label: 'My Children',
    path: '/parent',
    icon: Heart,
    roles: ['PARENT'],
  },
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

const ROLE_LABELS = {
  OWNER:              'Owner',
  SYSTEM_ADMIN:       'System Admin',
  HEADTEACHER:        'Head Teacher',
  ACADEMIC_TEACHER:   'Academic Teacher',
  DISCIPLINE_TEACHER: 'Discipline Teacher',
  CLASS_TEACHER:      'Class Teacher',
  SUBJECT_TEACHER:    'Subject Teacher',
  TEACHER:            'Teacher',
  BURSAR:             'Bursar',
  PARENT:             'Parent',
  STUDENT:            'Student',
}

function NavItem({ item, role, onClose }) {
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
  const role = user?.role ?? ''
  const isAdmin = ADMIN_ROLES.includes(role)

  const regularItems = NAV_ITEMS.filter(item => item.roles.includes(role))
  const showAdmin = isAdmin

  return (
    <aside className="flex flex-col h-full bg-primary text-white w-64 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-white/20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center font-bold text-white text-sm shrink-0">
            S
          </div>
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
          <NavItem key={item.path} item={item} role={role} onClose={onClose} />
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
              <NavItem key={item.path} item={item} role={role} onClose={onClose} />
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/20 px-4 py-4 space-y-3">
        <div>
          <div className="text-sm font-medium truncate">{user?.full_name ?? 'User'}</div>
          <span className="inline-block mt-1 text-[10px] bg-accent/80 text-white px-2 py-0.5 rounded-full">
            {ROLE_LABELS[role] ?? role}
          </span>
        </div>
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
