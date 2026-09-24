import {
  Activity,
  AlertTriangle,
  ChartColumn,
  BedDouble,
  BookOpen,
  Building2,
  Bus,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Clock,
  CreditCard,
  FileBarChart2,
  FileText,
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
  { label: 'Invoices',        path: '/fees',                   icon: FileText,      roles: FEATURE_ROLES.FEES, module: 'fees', group: 'fees' },
  { label: 'Student Fees',    path: '/fees/student',           icon: GraduationCap, roles: FEATURE_ROLES.FEES, module: 'fees', group: 'fees' },
  { label: 'Fee Reports',     path: '/fees/reports',           icon: FileBarChart2, roles: FEATURE_ROLES.FEES, module: 'fees', group: 'fees' },
  { label: 'Defaulters',      path: '/fees/defaulters',        icon: AlertTriangle, roles: FEATURE_ROLES.FEES, module: 'fees', group: 'fees' },
  { label: 'Fee Configuration', path: '/fees/config',          icon: Settings,      roles: FEATURE_ROLES.FEES, module: 'fees', group: 'fees' },
  { label: 'Academic Years',  path: '/fees/academic-years',    icon: CalendarDays,  roles: FEATURE_ROLES.FEES, module: 'fees', group: 'fees' },
  { label: 'Attendance',      path: '/attendance',     icon: CalendarCheck,   roles: FEATURE_ROLES.ATTENDANCE, module: 'attendance' },
  { label: 'Timetable',       path: '/timetable',      icon: Clock,           roles: FEATURE_ROLES.TIMETABLE, module: 'timetable', group: 'academics' },
  { label: 'Boarding',        path: '/boarding',       icon: BedDouble,       roles: FEATURE_ROLES.BOARDING, module: 'boarding', group: 'student_services' },
  { label: 'Library',         path: '/library',        icon: Library,         roles: FEATURE_ROLES.LIBRARY, module: 'library' },
  { label: 'Transport',       path: '/transport',      icon: Bus,             roles: FEATURE_ROLES.TRANSPORT, module: 'transport', group: 'student_services' },
  { label: 'Home Packages',   path: '/home-packages',  icon: Package,         roles: FEATURE_ROLES.HOME_PACKAGES, module: 'homepackages', group: 'student_services' },
  { label: 'Exams',           path: '/exams',          icon: ClipboardList,   roles: FEATURE_ROLES.EXAMS, module: 'exams', group: 'examinations' },
  { label: 'Exam Reports',    path: '/exams/reports',  icon: FileBarChart2,   roles: FEATURE_ROLES.EXAM_REPORTS, module: 'reports', group: 'examinations' },
  { label: 'Analytics',       path: '/analytics',      icon: ChartColumn,     roles: FEATURE_ROLES.ANALYTICS, module: 'analytics' },
  { label: 'Staff',           path: '/staff',          icon: Users,           roles: FEATURE_ROLES.STAFF },
  { label: 'Communications',  path: '/communications', icon: MessageSquare,   roles: FEATURE_ROLES.COMMUNICATIONS_HUB, modules: ['communications', 'sms'] },
  { label: 'School Calendar', path: '/school-calendar',icon: CalendarRange,   roles: FEATURE_ROLES.SCHOOL_CALENDAR, module: 'school_calendar', group: 'academics' },
  { label: 'My Children',     path: '/parent',         icon: Heart,           roles: FEATURE_ROLES.PARENT },
]

// Items carrying a `group` key are rendered as children of a collapsible
// parent in the sidebar. The parent sits where its first visible child sits
// and only appears if at least one child is visible for this user.
export const NAV_GROUPS = {
  fees:             { label: 'Fees',             icon: CreditCard },
  examinations:     { label: 'Examinations',     icon: ClipboardList },
  academics:        { label: 'Academics',        icon: BookOpen },
  student_services: { label: 'Student Services', icon: Building2 },
}

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

  // Sidebar structure: leaves stay as-is, grouped items collapse into one
  // { type: 'group' } entry. `regularItems` stays flat for quick search.
  const navEntries = []
  const groupEntries = {}
  for (const item of regularItems) {
    if (!item.group) {
      navEntries.push({ type: 'item', ...item })
      continue
    }
    if (!groupEntries[item.group]) {
      const { label, icon } = NAV_GROUPS[item.group]
      groupEntries[item.group] = { type: 'group', key: item.group, label, icon, children: [] }
      navEntries.push(groupEntries[item.group])
    }
    groupEntries[item.group].children.push(item)
  }

  return { regularItems, navEntries, adminItems: isAdmin ? ADMIN_NAV_ITEMS : [], showAdmin: isAdmin }
}
