import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertCircle,
  CalendarCheck,
  CreditCard,
  TrendingDown,
  Users,
} from 'lucide-react'
import StatCard from '../../components/ui/StatCard'
import api from '../../lib/axios'
import { formatTZS } from '../../lib/format'

// ── Data fetchers ─────────────────────────────────────────────────────────────

const fetchStudentCount = () =>
  api.get('/students/?status=ACTIVE').then((r) => r.data)

const fetchFeeSummary = () =>
  api.get('/fees/summary/?term=current').then((r) => r.data)

const fetchAttendance = () =>
  api.get('/attendance/daily-summary/').then((r) => r.data)

const fetchDefaulters = () =>
  api.get('/fees/defaulters/?limit=5').then((r) => r.data)

const fetchMonthly = () =>
  api.get('/fees/summary/monthly/').then((r) => r.data)

// ── Skeleton helpers ──────────────────────────────────────────────────────────

function Skeleton({ className }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-7 w-36 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  )
}

// ── Y-axis tick formatter ─────────────────────────────────────────────────────

function shortTZS(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

// ── Custom bar chart tooltip ──────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-gray-700 mb-0.5">{label}</p>
      <p className="text-primary font-semibold">{formatTZS(payload[0].value)}</p>
    </div>
  )
}

// ── Error banner ──────────────────────────────────────────────────────────────

function ErrorBanner({ message }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-danger">
      <AlertCircle size={16} className="shrink-0" />
      {message}
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [sendingId, setSendingId] = useState(null)

  const studentsQ = useQuery({ queryKey: ['dash-students'], queryFn: fetchStudentCount })
  const feeQ = useQuery({ queryKey: ['dash-fees'], queryFn: fetchFeeSummary })
  const attQ = useQuery({ queryKey: ['dash-attendance'], queryFn: fetchAttendance })
  const defaultersQ = useQuery({ queryKey: ['dash-defaulters'], queryFn: fetchDefaulters })
  const monthlyQ = useQuery({ queryKey: ['dash-monthly'], queryFn: fetchMonthly })

  const anyError =
    studentsQ.isError || feeQ.isError || attQ.isError || defaultersQ.isError

  async function sendReminder(studentId) {
    setSendingId(studentId)
    try {
      const { data } = await api.post('/communications/fee-reminders/', {
        student_id: studentId,
      })
      if (data.wa_url) {
        window.open(data.wa_url, '_blank', 'noopener,noreferrer')
        toast.success('WhatsApp opened with pre-filled reminder.')
      } else {
        toast.success('Reminder sent via email.')
      }
    } catch (err) {
      const msg =
        err.response?.data?.detail ?? 'Failed to send reminder. Try again.'
      toast.error(msg)
    } finally {
      setSendingId(null)
    }
  }

  // ── Derived stat values ───────────────────────────────────────────────────

  const totalStudents = studentsQ.data?.count ?? null
  const feesCollected = feeQ.data?.total_collected ?? null
  const feesOutstanding = feeQ.data?.total_outstanding ?? null
  const attendanceRate = attQ.data?.rate_percent ?? null

  const monthlyData = (monthlyQ.data ?? []).map((row) => ({
    ...row,
    collected: parseFloat(row.collected) || 0,
  }))

  const defaulters = defaultersQ.data ?? []

  return (
    <div className="space-y-6">
      {anyError && (
        <ErrorBanner message="Some dashboard data could not be loaded. The figures below may be incomplete." />
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {studentsQ.isLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            title="Total Students"
            value={totalStudents !== null ? totalStudents.toLocaleString() : '—'}
            icon={Users}
            color="bg-primary"
            subtitle="Active enrolments"
          />
        )}

        {feeQ.isLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            title="Fees Collected"
            value={feesCollected !== null ? formatTZS(feesCollected) : '—'}
            icon={CreditCard}
            color="bg-success"
            subtitle={
              feeQ.data?.collection_rate_percent
                ? `${feeQ.data.collection_rate_percent}% collection rate`
                : 'Current year'
            }
          />
        )}

        {feeQ.isLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            title="Outstanding Fees"
            value={feesOutstanding !== null ? formatTZS(feesOutstanding) : '—'}
            icon={TrendingDown}
            color="bg-danger"
            subtitle="Unpaid + partial invoices"
          />
        )}

        {attQ.isLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            title="Today's Attendance"
            value={
              attendanceRate !== null
                ? `${parseFloat(attendanceRate).toFixed(1)}%`
                : '—'
            }
            icon={CalendarCheck}
            color="bg-secondary"
            subtitle={
              attQ.data?.total_records
                ? `${attQ.data.present} present of ${attQ.data.total_records}`
                : 'No records today'
            }
          />
        )}
      </div>

      {/* ── Charts + defaulters grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Revenue bar chart */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Monthly Revenue ({new Date().getFullYear()})
          </h2>
          {monthlyQ.isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : monthlyQ.isError ? (
            <ErrorBanner message="Could not load chart data." />
          ) : monthlyData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm">
              <CreditCard size={32} className="mb-2 text-gray-200" />
              No payment data for this year yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={shortTZS}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f3f4f6' }} />
                <Bar
                  dataKey="collected"
                  fill="#1B4F72"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top 5 defaulters */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Top Fee Defaulters
          </h2>

          {defaultersQ.isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 w-24 rounded-lg" />
                </div>
              ))}
            </div>
          ) : defaultersQ.isError ? (
            <ErrorBanner message="Could not load defaulters list." />
          ) : defaulters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm">
              <Users size={32} className="mb-2 text-gray-200" />
              No fee defaulters — great news!
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-400 pb-2 pr-3">
                      Student
                    </th>
                    <th className="text-left text-xs font-medium text-gray-400 pb-2 pr-3">
                      Level
                    </th>
                    <th className="text-right text-xs font-medium text-gray-400 pb-2 pr-3">
                      Balance
                    </th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {defaulters.map((row) => (
                    <tr key={row.student_id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-gray-800 truncate max-w-[140px]">
                          {row.student_name}
                        </div>
                        <div className="text-xs text-gray-400">{row.student_id}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-gray-500 text-xs whitespace-nowrap">
                        {row.level}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-danger text-xs whitespace-nowrap">
                        {formatTZS(row.balance)}
                      </td>
                      <td className="py-2.5">
                        <button
                          onClick={() => sendReminder(row.student_id)}
                          disabled={sendingId === row.student_id}
                          className="px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary
                            text-xs font-medium hover:bg-primary hover:text-white
                            transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                            whitespace-nowrap"
                        >
                          {sendingId === row.student_id ? 'Sending…' : 'Send Reminder'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
