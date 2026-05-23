import {
  CalendarCheck,
  ClipboardList,
  CreditCard,
  GraduationCap,
  Heart,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Users,
  X,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const NAV_ITEMS = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
    roles: ['OWNER', 'HEADTEACHER', 'BURSAR', 'TEACHER'],
  },
  {
    label: 'Students',
    path: '/students',
    icon: GraduationCap,
    roles: ['OWNER', 'HEADTEACHER', 'TEACHER', 'BURSAR'],
    readOnly: ['TEACHER', 'BURSAR'],
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
    roles: ['OWNER', 'HEADTEACHER', 'TEACHER'],
  },
  {
    label: 'Exams',
    path: '/exams',
    icon: ClipboardList,
    roles: ['OWNER', 'HEADTEACHER', 'TEACHER'],
  },
  {
    label: 'Staff',
    path: '/staff',
    icon: Users,
    roles: ['OWNER', 'HEADTEACHER'],
  },
  {
    label: 'Communications',
    path: '/communications',
    icon: MessageSquare,
    roles: ['OWNER', 'HEADTEACHER'],
  },
  {
    label: 'My Children',
    path: '/parent',
    icon: Heart,
    roles: ['PARENT'],
  },
]

const ROLE_LABELS = {
  OWNER: 'Owner',
  HEADTEACHER: 'Head Teacher',
  TEACHER: 'Teacher',
  BURSAR: 'Bursar',
  PARENT: 'Parent',
  STUDENT: 'Student',
}

export default function Sidebar({ onClose }) {
  const { user, logout } = useAuth()
  const role = user?.role ?? ''
  const navItems = NAV_ITEMS.filter((item) => item.roles.includes(role))

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
        {navItems.map((item) => {
          const Icon = item.icon
          const isReadOnly = item.readOnly?.includes(role)
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-white/20 text-white font-medium'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className="flex-1">{item.label}</span>
              {isReadOnly && (
                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white/60">
                  view
                </span>
              )}
            </NavLink>
          )
        })}
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
