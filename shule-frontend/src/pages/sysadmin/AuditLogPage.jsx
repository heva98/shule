import { useQuery } from '@tanstack/react-query'
import {
  BookOpen, CalendarDays, Download, Filter,
  Key, LogIn, LogOut, ScrollText, Settings, Shield, Upload, Users,
} from 'lucide-react'
import { useState } from 'react'
import { getAuditLogs, getUsers } from '../../api/sysadmin'

const ACTION_CONFIG = {
  USER_CREATED:     { Icon: Users,       color: 'bg-green-100 text-green-600',   label: 'User Created' },
  ROLE_CHANGED:     { Icon: Shield,      color: 'bg-blue-100 text-blue-600',     label: 'Role Changed' },
  USER_DEACTIVATED: { Icon: Users,       color: 'bg-red-100 text-red-600',       label: 'User Deactivated' },
  USER_ACTIVATED:   { Icon: Users,       color: 'bg-green-100 text-green-600',   label: 'User Activated' },
  SETTINGS_UPDATED: { Icon: Settings,    color: 'bg-orange-100 text-orange-600', label: 'Settings Updated' },
  SUBJECT_ADDED:    { Icon: BookOpen,    color: 'bg-teal-100 text-teal-600',     label: 'Subject Added' },
  SUBJECT_UPDATED:  { Icon: BookOpen,    color: 'bg-teal-100 text-teal-600',     label: 'Subject Updated' },
  SUBJECT_DELETED:  { Icon: BookOpen,    color: 'bg-red-100 text-red-600',       label: 'Subject Deleted' },
  YEAR_CREATED:     { Icon: CalendarDays,color: 'bg-indigo-100 text-indigo-600', label: 'Year Created' },
  YEAR_UPDATED:     { Icon: CalendarDays,color: 'bg-indigo-100 text-indigo-600', label: 'Year Updated' },
  PASSWORD_RESET:   { Icon: Key,         color: 'bg-yellow-100 text-yellow-600', label: 'Password Reset' },
  LOGIN:            { Icon: LogIn,       color: 'bg-gray-100 text-gray-500',     label: 'Login' },
  LOGOUT:           { Icon: LogOut,      color: 'bg-gray-100 text-gray-400',     label: 'Logout' },
  BULK_IMPORT:      { Icon: Upload,      color: 'bg-purple-100 text-purple-600', label: 'Bulk Import' },
}

function fmtDateTime(ts) {
  return new Date(ts).toLocaleString('en-TZ', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function LogEntry({ log }) {
  const cfg = ACTION_CONFIG[log.action] ?? ACTION_CONFIG.LOGIN
  const { Icon } = cfg
  return (
    <div className="flex items-start gap-4 py-4 px-2 group">
      <div className="relative flex-shrink-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${cfg.color}`}>
          <Icon size={15} />
        </div>
        <div className="absolute left-1/2 top-9 w-px h-full bg-gray-100 -translate-x-1/2" />
      </div>
      <div className="flex-1 min-w-0 pb-2">
        <p className="text-sm text-gray-800 leading-snug">{log.description}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          <span className="text-xs font-medium text-gray-500">{log.performed_by_name}</span>
          <span className="text-xs text-gray-300">·</span>
          <span className="text-xs text-gray-400" title={fmtDateTime(log.timestamp)}>{timeAgo(log.timestamp)}</span>
          <span className="text-xs text-gray-300">·</span>
          <span className="text-xs text-gray-400">{fmtDateTime(log.timestamp)}</span>
          {log.ip_address && (
            <>
              <span className="text-xs text-gray-300">·</span>
              <span className="text-xs font-mono text-gray-300">{log.ip_address}</span>
            </>
          )}
        </div>
      </div>
      <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full mt-1 ${cfg.color}`}>
        {cfg.label}
      </span>
    </div>
  )
}

export default function AuditLogPage() {
  const [action, setAction] = useState('')
  const [userId, setUserId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const params = {
    action: action || undefined,
    user: userId || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page,
    page_size: 25,
  }

  const q = useQuery({ queryKey: ['admin-audit-logs', params], queryFn: () => getAuditLogs(params) })
  const usersQ = useQuery({ queryKey: ['admin-users-list'], queryFn: () => getUsers({ page_size: 200 }) })

  const logs = q.data?.results ?? []
  const total = q.data?.count ?? 0

  function exportCSV() {
    if (!logs.length) return
    const headers = ['Timestamp', 'Performed By', 'Action', 'Description', 'IP Address']
    const rows = logs.map(l => [
      fmtDateTime(l.timestamp),
      l.performed_by_name,
      l.action,
      `"${l.description.replace(/"/g, '""')}"`,
      l.ip_address ?? '',
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={14} className="text-gray-400 shrink-0" />
          <select value={action} onChange={e => { setAction(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none">
            <option value="">All actions</option>
            {Object.entries(ACTION_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select value={userId} onChange={e => { setUserId(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none">
            <option value="">All users</option>
            {(usersQ.data?.results ?? []).map(u => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none" />
          <span className="text-gray-400 text-xs">to</span>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none" />
          <button
            onClick={() => { setAction(''); setUserId(''); setDateFrom(''); setDateTo(''); setPage(1) }}
            className="text-xs text-gray-400 hover:text-gray-600 ml-auto"
          >
            Clear filters
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline">
            <Download size={13} /> Export CSV
          </button>
        </div>
        {total > 0 && <p className="text-xs text-gray-400 mt-2">{total} entries</p>}
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        {q.isLoading ? (
          <div className="space-y-4 p-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-100 animate-pulse rounded w-3/4" />
                  <div className="h-2 bg-gray-100 animate-pulse rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <ScrollText size={36} className="text-gray-200 mb-3" />
            <p className="text-sm">No audit log entries found.</p>
          </div>
        ) : (
          <div className="px-4 divide-y divide-gray-50">
            {logs.map(log => <LogEntry key={log.id} log={log} />)}
          </div>
        )}

        {/* Pagination */}
        {total > 25 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            <span>{total} total entries</span>
            <div className="flex items-center gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">Prev</button>
              <span>Page {page} of {Math.ceil(total / 25)}</span>
              <button disabled={page >= Math.ceil(total / 25)} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
