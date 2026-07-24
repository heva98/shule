import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertCircle, CheckCircle2, Database, Mail, MessageSquare,
  RefreshCw, Smartphone, Zap,
} from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { getSystemHealth } from '../../api/sysadmin'
import api from '../../lib/axios'

function StatusDot({ ok, loading }) {
  if (loading) return <span className="w-3 h-3 rounded-full bg-gray-300 animate-pulse inline-block" />
  return (
    <span className={`w-3 h-3 rounded-full inline-block ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
  )
}

function ServiceCard({ title, icon: Icon, ok, loading, detail, badge, badgeColor }) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-5 space-y-3 ${
      ok === false ? 'border-red-200' : ok === true ? 'border-green-100' : 'border-gray-100'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-800">{title}</span>
        </div>
        <StatusDot ok={ok} loading={loading} />
      </div>
      {detail && <p className="text-xs text-gray-500">{detail}</p>}
      {badge && (
        <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColor ?? 'bg-gray-100 text-gray-500'}`}>
          {badge}
        </span>
      )}
    </div>
  )
}

function StatBox({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1.5">
        {value ?? <span className="text-gray-300">—</span>}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function SystemHealthPage() {
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const q = useQuery({
    queryKey: ['admin-health'],
    queryFn: getSystemHealth,
    refetchInterval: 30_000,
    onSuccess: () => setLastRefresh(new Date()),
  })
  const h = q.data

  const absenceMut = useMutation({
    mutationFn: () => api.post('/communications/absence-alerts/').then(r => r.data),
    onSuccess: (data) => {
      toast.success(`Absence alerts sent to ${data.sent ?? 0} guardians.`)
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to run absence alerts.'),
  })

  function refresh() {
    q.refetch()
    setLastRefresh(new Date())
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            Auto-refreshes every 30 seconds · Last updated:{' '}
            {lastRefresh.toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={q.isFetching}
          className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={13} className={q.isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Service cards */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Services</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          <ServiceCard
            title="Database"
            icon={Database}
            ok={h?.database?.ok}
            loading={q.isLoading}
            detail={h?.database?.latency_ms ? `Latency: ${h.database.latency_ms}ms` : undefined}
            badge={h?.database?.ok ? 'Connected' : 'Error'}
            badgeColor={h?.database?.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}
          />
          <ServiceCard
            title="Celery Worker"
            icon={Zap}
            ok={h?.celery?.ok}
            loading={q.isLoading}
            detail="Background task processing"
            badge={h?.celery?.ok ? 'Running' : 'Offline'}
            badgeColor={h?.celery?.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}
          />
          <ServiceCard
            title="Email (SMTP)"
            icon={Mail}
            ok={h?.email_configured}
            loading={q.isLoading}
            detail="Django email backend"
            badge={h?.email_configured ? 'Configured' : 'Not configured'}
            badgeColor={h?.email_configured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
          />
          <ServiceCard
            title="WhatsApp"
            icon={MessageSquare}
            ok={true}
            loading={q.isLoading}
            detail="wa.me deep-link integration"
            badge="Active"
            badgeColor="bg-green-100 text-green-700"
          />
          <ServiceCard
            title="SMS"
            icon={Smartphone}
            ok={null}
            loading={q.isLoading}
            detail="Africa's Talking"
            badge="Coming soon"
            badgeColor="bg-gray-100 text-gray-400"
          />
        </div>
      </div>

      {/* System stats */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">System Stats</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatBox
            label="Active Users"
            value={q.isLoading ? '…' : h?.active_users?.toLocaleString()}
            sub="System accounts"
          />
          <StatBox
            label="Total Students"
            value={q.isLoading ? '…' : h?.total_students?.toLocaleString()}
            sub="Across all years"
          />
          <StatBox
            label="Storage Used"
            value={q.isLoading ? '…' : h?.storage_mb != null ? `${h.storage_mb} MB` : '—'}
            sub="Media uploads"
          />
          <StatBox
            label="DB Latency"
            value={q.isLoading ? '…' : h?.database?.latency_ms != null ? `${h.database.latency_ms}ms` : '—'}
            sub="Current ping"
          />
          <StatBox
            label="Last Backup"
            value="—"
            sub="Manual backups only"
          />
        </div>
      </div>

      {/* Overall status banner */}
      {!q.isLoading && h && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          h.database.ok
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {h.database.ok
            ? <CheckCircle2 size={18} className="text-green-600 shrink-0" />
            : <AlertCircle size={18} className="text-red-600 shrink-0" />}
          <div>
            <p className="text-sm font-semibold">
              {h.database.ok ? 'All core systems operational' : 'Database connection error'}
            </p>
            <p className="text-xs mt-0.5 opacity-75">
              {h.database.ok
                ? `Database responding · Celery ${h.celery.ok ? 'running' : 'offline'} · ${h.email_configured ? 'Email configured' : 'Email not configured'}`
                : 'Check DATABASE_URL in server environment and restart the Django service.'}
            </p>
          </div>
        </div>
      )}

      {/* Manual actions */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Manual Actions</h2>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">Run Absence Alerts Now</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Sends WhatsApp/email notifications to guardians of today's absent students.
              </p>
            </div>
            <button
              onClick={() => absenceMut.mutate()}
              disabled={absenceMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 shrink-0"
            >
              <Zap size={13} />
              {absenceMut.isPending ? 'Running…' : 'Run Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
