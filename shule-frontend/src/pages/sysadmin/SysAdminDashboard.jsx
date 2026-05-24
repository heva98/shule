import { useQuery } from '@tanstack/react-query'
import {
  Activity, BookOpen, CalendarDays, Plus,
  ScrollText, Settings, Shield, UserCog, Users,
} from 'lucide-react'
import { useState } from 'react'
import { Cell, Pie, PieChart, Tooltip } from 'recharts'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getAuditLogs, getSettings, getSystemHealth, getUsers } from '../../api/sysadmin'
import { getStudents } from '../../api/students'
import Modal from '../../components/ui/Modal'
import AddUserModal from './components/AddUserModal'

// ── Utilities ─────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString('en-TZ', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Role breakdown ─────────────────────────────────────────────────────────────

const ROLE_COLORS = {
  OWNER: '#7C3AED',
  SYSTEM_ADMIN: '#DC2626',
  HEADTEACHER: '#1B4F72',
  ACADEMIC_TEACHER: '#EA580C',
  CLASS_TEACHER: '#16A34A',
  SUBJECT_TEACHER: '#0D9488',
  DISCIPLINE_TEACHER: '#9333EA',
  TEACHER: '#2E86C1',
  BURSAR: '#D97706',
  PARENT: '#6B7280',
  STUDENT: '#0EA5E9',
}

const ACTION_ICONS = {
  USER_CREATED: { icon: Users, color: 'text-green-600 bg-green-50' },
  ROLE_CHANGED: { icon: Shield, color: 'text-blue-600 bg-blue-50' },
  USER_DEACTIVATED: { icon: Users, color: 'text-red-600 bg-red-50' },
  USER_ACTIVATED: { icon: Users, color: 'text-green-600 bg-green-50' },
  SETTINGS_UPDATED: { icon: Settings, color: 'text-orange-600 bg-orange-50' },
  SUBJECT_ADDED: { icon: BookOpen, color: 'text-teal-600 bg-teal-50' },
  SUBJECT_UPDATED: { icon: BookOpen, color: 'text-teal-600 bg-teal-50' },
  SUBJECT_DELETED: { icon: BookOpen, color: 'text-red-600 bg-red-50' },
  YEAR_CREATED: { icon: CalendarDays, color: 'text-indigo-600 bg-indigo-50' },
  YEAR_UPDATED: { icon: CalendarDays, color: 'text-indigo-600 bg-indigo-50' },
  PASSWORD_RESET: { icon: Shield, color: 'text-yellow-600 bg-yellow-50' },
  LOGIN: { icon: Users, color: 'text-gray-500 bg-gray-50' },
  LOGOUT: { icon: Users, color: 'text-gray-400 bg-gray-50' },
  BULK_IMPORT: { icon: Users, color: 'text-purple-600 bg-purple-50' },
}

function ActionIcon({ action }) {
  const cfg = ACTION_ICONS[action] ?? ACTION_ICONS.LOGIN
  const Icon = cfg.icon
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${cfg.color}`}>
      <Icon size={14} />
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function Card({ title, value, sub, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="mt-1.5 text-2xl font-bold text-gray-900 leading-none">{value}</p>
          {sub && <p className="mt-1.5 text-xs text-gray-400">{sub}</p>}
        </div>
        {Icon && (
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
            <Icon size={20} className="text-white" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Quick action card ──────────────────────────────────────────────────────────

function ActionCard({ label, icon: Icon, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col items-center
                 gap-3 hover:border-primary/30 hover:shadow-md transition-all text-center group"
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color} group-hover:scale-105 transition-transform`}>
        <Icon size={22} className="text-white" />
      </div>
      <span className="text-sm font-medium text-gray-700 group-hover:text-primary">{label}</span>
    </button>
  )
}

// ── Role donut chart ───────────────────────────────────────────────────────────

function RoleDonut({ users }) {
  if (!users?.length) return <div className="h-32 flex items-center justify-center text-gray-400 text-xs">No users</div>
  const byRole = {}
  users.forEach(u => { byRole[u.role] = (byRole[u.role] || 0) + 1 })
  const data = Object.entries(byRole).map(([role, count]) => ({ name: role, value: count }))
  return (
    <div className="flex items-center gap-4">
      <PieChart width={100} height={100}>
        <Pie data={data} cx={45} cy={45} innerRadius={28} outerRadius={45} dataKey="value">
          {data.map(d => (
            <Cell key={d.name} fill={ROLE_COLORS[d.name] ?? '#9CA3AF'} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v, n) => [v, n]}
          contentStyle={{ fontSize: 11, padding: '4px 8px' }}
        />
      </PieChart>
      <div className="flex flex-col gap-1 text-xs">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ROLE_COLORS[d.name] ?? '#9CA3AF' }} />
            <span className="text-gray-500">{d.name}</span>
            <span className="font-semibold text-gray-800 ml-auto pl-2">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main dashboard ─────────────────────────────────────────────────────────────

export default function SysAdminDashboard() {
  const navigate = useNavigate()
  const [showAddUser, setShowAddUser] = useState(false)

  const settingsQ = useQuery({ queryKey: ['admin-settings'], queryFn: getSettings })
  const usersQ = useQuery({ queryKey: ['admin-users', { page_size: 200 }], queryFn: () => getUsers({ page_size: 200 }) })
  const studentsQ = useQuery({ queryKey: ['admin-students'], queryFn: () => getStudents({ status: 'ACTIVE' }) })
  const healthQ = useQuery({ queryKey: ['admin-health'], queryFn: getSystemHealth })
  const logsQ = useQuery({ queryKey: ['admin-logs-recent'], queryFn: () => getAuditLogs({ page_size: 10 }) })

  const schoolName = settingsQ.data?.school_name ?? 'Shule SMS'
  const totalUsers = usersQ.data?.count ?? '—'
  const allUsers = usersQ.data?.results ?? []
  const totalStudents = studentsQ.data?.count ?? '—'
  const dbOk = healthQ.data?.database?.ok
  const healthLabel = healthQ.isLoading ? '…' : dbOk ? 'All Systems OK' : 'Issues Detected'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">System Administrator Panel</h1>
        <p className="text-sm text-gray-500 mt-0.5">{schoolName}</p>
      </div>

      {/* Row 1 — Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 col-span-1 sm:col-span-2 xl:col-span-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Total Users</p>
          <p className="text-2xl font-bold text-gray-900 mb-3">{totalUsers}</p>
          <RoleDonut users={allUsers} />
        </div>

        <Card
          title="Total Students"
          value={typeof totalStudents === 'number' ? totalStudents.toLocaleString() : totalStudents}
          sub="Active enrolments"
          icon={Users}
          color="bg-secondary"
        />

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active Year</p>
          <p className="text-2xl font-bold text-gray-900 mt-1.5">
            {healthQ.data ? (healthQ.data.active_users ? '—' : '—') : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-1.5">Configure in Academic Years</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">System Health</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`w-3 h-3 rounded-full shrink-0 ${
              healthQ.isLoading ? 'bg-gray-300' : dbOk ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-sm font-semibold text-gray-700">{healthLabel}</span>
          </div>
          {healthQ.data?.database?.latency_ms && (
            <p className="text-xs text-gray-400 mt-1">DB {healthQ.data.database.latency_ms}ms</p>
          )}
        </div>
      </div>

      {/* Row 2 — Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <ActionCard label="Add User"            icon={Plus}         color="bg-primary"   onClick={() => setShowAddUser(true)} />
          <ActionCard label="Assign Role"         icon={Shield}       color="bg-secondary" onClick={() => navigate('/admin-panel/roles')} />
          <ActionCard label="Add Subject"         icon={BookOpen}     color="bg-teal-600"  onClick={() => navigate('/admin-panel/subjects')} />
          <ActionCard label="Academic Year"       icon={CalendarDays} color="bg-indigo-600" onClick={() => navigate('/admin-panel/academic-years')} />
          <ActionCard label="School Settings"     icon={Settings}     color="bg-accent"    onClick={() => navigate('/admin-panel/settings')} />
          <ActionCard label="View Audit Log"      icon={ScrollText}   color="bg-gray-600"  onClick={() => navigate('/admin-panel/audit-logs')} />
        </div>
      </div>

      {/* Row 3 — Recent activity */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
          <button
            onClick={() => navigate('/admin-panel/audit-logs')}
            className="text-xs text-primary hover:underline"
          >
            View all
          </button>
        </div>

        {logsQ.isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 bg-gray-100 animate-pulse rounded w-3/4" />
                  <div className="h-2 bg-gray-100 animate-pulse rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : (logsQ.data?.results ?? []).length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No activity yet.</p>
        ) : (
          <div className="space-y-3">
            {(logsQ.data?.results ?? []).map(log => (
              <div key={log.id} className="flex items-start gap-3">
                <ActionIcon action={log.action} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 leading-snug">{log.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">{log.performed_by_name}</span>
                    <span className="text-gray-200">·</span>
                    <span className="text-xs text-gray-400">{timeAgo(log.timestamp)}</span>
                  </div>
                </div>
                <span className="text-xs text-gray-300 whitespace-nowrap shrink-0 hidden sm:block">
                  {fmtDate(log.timestamp).split(',')[0]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddUserModal isOpen={showAddUser} onClose={() => setShowAddUser(false)} />
    </div>
  )
}
