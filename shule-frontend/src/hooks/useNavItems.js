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
  LayoutDashboard,
  Library,
  Monitor,
  MessageSquare,
  Package,
  ScrollText,
  Settings,
  Shield,
  UserCog,
  Users,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isModuleVisible, useEnabledModules } from './useEnabledModules'
import { FEATURE_ROLES } from '../lib/constants'

const ADMIN_ROLES = FEATURE_ROLES.ADMIN

// `module: null` (or omitted) means core — always shown regardless of
// ENABLED_MODULES. Everything else is filtered against it below.
export const NAV_ITEMS = [
  { label: 'Dashboard',       path: '/dashboard',      icon: LayoutDashboard, roles: FEATURE_ROLES.DASHBOARD },
  { label: 'Students',        path: '/students',       icon: GraduationCap,   roles: FEATURE_ROLES.STUDENTS },
  { label: 'Fees',            path: '/fees',           icon: CreditCard,      roles: FEATURE_ROLES.FEES, module: 'fees' },
  { label: 'Attendance',      path: '/attendance',     icon: CalendarCheck,   roles: FEATURE_ROLES.ATTENDANCE, module: 'attendance' },
  { label: 'Timetable',       path: '/timetable',      icon: Clock,           roles: FEATURE_ROLES.TIMETABLE, module: 'timetable' },
  { label: 'Boarding',        path: '/boarding',       icon: BedDouble,       roles: FEATURE_ROLES.BOARDING, module: 'boarding' },
  { label: 'Library',         path: '/library',        icon: Library,         roles: FEATURE_ROLES.LIBRARY, module: 'library' },
  { label: 'Transport',       path: '/transport',      icon: Bus,             roles: FEATURE_ROLES.TRANSPORT, module: 'transport' },
  { label: 'Home Packages',   path: '/home-packages',  icon: Package,         roles: FEATURE_ROLES.HOME_PACKAGES, module: 'homepackages' },
  { label: 'Exams',           path: '/exams',          icon: ClipboardList,   roles: FEATURE_ROLES.EXAMS, module: 'exams' },
  { label: 'Exam Reports',    path: '/exams/reports',  icon: FileBarChart2,   roles: FEATURE_ROLES.EXAM_REPORTS, module: 'reports' },
  { label: 'Staff',           path: '/staff',          icon: Users,           roles: FEATURE_ROLES.STAFF },
  { label: 'Communications',  path: '/communications', icon: MessageSquare,   roles: FEATURE_ROLES.COMMUNICATIONS_HUB, modules: ['communications', 'sms'] },
  { label: 'School Calendar', path: '/school-calendar',icon: CalendarRange,   roles: FEATURE_ROLES.SCHOOL_CALENDAR, module: 'school_calendar' },
  { label: 'My Children',     path: '/parent',         icon: Heart,           roles: FEATURE_ROLES.PARENT },
]

export const ADMIN_NAV_ITEMS = [
  { label: 'System Dashboard',    path: '/admin-panel',                icon: Monitor },
  { label: 'User Management',     path: '/admin-panel/users',          icon: UserCog },
  { label: 'Role Assignment',     path: '/admin-panel/roles',          icon: Shield },
  { label: 'Subjects & Classes',  path: '/admin-panel/subjects',       icon: BookOpen },
  { label: 'Academic Year Setup', path: '/admin-panel/academic-years', icon: CalendarDays },
  { label: 'School Settings',     path: '/admin-panel/settings',       icon: Settings },
  { label: 'Audit Logs',          path: '/admin-panel/audit-logs',     icon: ScrollText },
  { label: 'System Health',       path: '/admin-panel/system-health',  icon: Activity },
]

export function useNavItems() {
  const { user } = useAuth()
  const { enabledModules, modulesLoading } = useEnabledModules()
  const role = user?.role ?? ''
  const isAdmin = ADMIN_ROLES.includes(role)

  const regularItems = NAV_ITEMS.filter(item => {
    if (!item.roles.includes(role)) return false
    // `modules` (a list) means "visible if any one of these is on"; `module`
    // (a single name) is the common case.
    if (item.modules) {
      return item.modules.some(m => isModuleVisible(m, enabledModules, modulesLoading))
    }
    return isModuleVisible(item.module, enabledModules, modulesLoading)
  })

  return { regularItems, adminItems: isAdmin ? ADMIN_NAV_ITEMS : [], showAdmin: isAdmin }
}
