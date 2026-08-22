import {
  CalendarCheck,
  ClipboardList,
  CreditCard,
  FileBarChart2,
  GraduationCap,
  MessageSquare,
  Shield,
  UserCog,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { FEATURE_ROLES } from '../../lib/constants'

// Shared by both dashboards (DashboardRouter picks one or the other by
// role) so a deployment with only a few modules enabled — a role with few
// pages to reach — still gets a dashboard that feels populated instead of
// a lone stat card. Filtered by role AND by ENABLED_MODULES, so it never
// links anywhere that would just redirect back out or 403.
const QUICK_LINKS = [
  { label: 'Students',       path: '/students',       icon: GraduationCap, module: null,             roles: FEATURE_ROLES.STUDENTS },
  { label: 'Staff',          path: '/staff',           icon: UserCog,       module: null,             roles: FEATURE_ROLES.STAFF },
  { label: 'Exams & Marks',  path: '/exams',           icon: ClipboardList, module: 'exams',          roles: FEATURE_ROLES.EXAMS },
  { label: 'Exam Reports',   path: '/exams/reports',   icon: FileBarChart2, module: 'reports',        roles: FEATURE_ROLES.EXAM_REPORTS },
  { label: 'Fees',           path: '/fees',            icon: CreditCard,    module: 'fees',           roles: FEATURE_ROLES.FEES },
  { label: 'Attendance',     path: '/attendance',      icon: CalendarCheck, module: 'attendance',     roles: FEATURE_ROLES.ATTENDANCE },
  { label: 'Communications', path: '/communications',  icon: MessageSquare, module: 'communications', roles: FEATURE_ROLES.COMMUNICATIONS },
  { label: 'Admin Panel',    path: '/admin-panel',     icon: Shield,        module: null,             roles: FEATURE_ROLES.ADMIN },
]

export default function QuickLinksPanel({ role, enabledModules }) {
  const links = QUICK_LINKS.filter(
    (l) => l.roles.includes(role) && (!l.module || enabledModules.includes(l.module))
  )
  if (links.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Quick Links</h2>
      <div className="grid grid-cols-2 gap-3">
        {links.map(({ label, path, icon: Icon }) => (
          <Link
            key={path}
            to={path}
            className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-gray-50 hover:bg-gray-100
              text-sm font-medium text-gray-700 transition-colors"
          >
            <Icon size={15} className="text-primary shrink-0" />
            {label}
          </Link>
        ))}
      </div>
    </div>
  )
}
