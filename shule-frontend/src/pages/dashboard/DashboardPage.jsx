import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
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
  ClipboardList,
  CreditCard,
  TrendingDown,
  UserCog,
  Users,
} from 'lucide-react'
import QuickLinksPanel from '../../components/dashboard/QuickLinksPanel'
import SchoolPerformancePanels from '../../components/dashboard/SchoolPerformancePanels'
import StatCard from '../../components/ui/StatCard'
import { useAuth } from '../../context/AuthContext'
import { useEnabledModules } from '../../hooks/useEnabledModules'
import { getDashboardSummary } from '../../api/dashboard'
import { sendFeeReminder } from '../../api/communications'
import { LEVEL_LABEL } from '../../lib/constants'
import { formatTZS } from '../../lib/format'

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

function EmptyState({ icon: Icon, message }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
      <Icon size={28} className="mb-2 text-gray-200" />
      {message}
    </div>
  )
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth()
  const role = user?.role
  const [sendingId, setSendingId] = useState(null)
  const { enabledModules, modulesLoading } = useEnabledModules()
  const feesEnabled = !modulesLoading && enabledModules.includes('fees')
  const attendanceEnabled = !modulesLoading && enabledModules.includes('attendance')
  const examsEnabled = !modulesLoading && enabledModules.includes('exams')
  // Staff records include salary/national ID — StaffViewSet itself is
  // restricted to Owner/Headteacher/Academic Teacher, so Bursar never
  // queries it (would 403). DashboardSummaryView mirrors this server-side.
  const canSeeStaff = ['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER'].includes(role)

  // One combined request instead of 7 separate parallel ones — see
  // accounts.views.DashboardSummaryView. Each section is null when its
  // module is disabled for this deployment, so the `*Enabled` flags above
  // still control whether a card/panel renders at all.
  const summaryQ = useQuery({ queryKey: ['dash-summary'], queryFn: getDashboardSummary })
  const data = summaryQ.data
  const isLoading = summaryQ.isLoading
  const isError = summaryQ.isError

  async function sendReminder(studentId) {
    setSendingId(studentId)
    try {
      await sendFeeReminder(studentId)
      toast.success('Reminder sent via email.')
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Failed to send reminder. Try again.')
    } finally {
      setSendingId(null)
    }
  }

  // ── Derived stat values ───────────────────────────────────────────────────

  const totalStudents = data?.students?.count ?? null
  const totalStaff = data?.staff?.count ?? null
  const feesCollected = data?.fees?.total_collected ?? null
  const feesOutstanding = data?.fees?.total_outstanding ?? null
  const attendanceRate = data?.attendance?.rate_percent ?? null

  // Already filtered to "ends today or later", sorted by start_date, and
  // capped at 5 server-side — see DashboardSummaryView.
  const upcomingExams = data?.exams?.upcoming ?? []
  const upcomingExamsCount = data?.exams?.upcoming_count ?? 0

  const monthlyData = (data?.monthly_revenue ?? []).map((row) => ({
    ...row,
    collected: parseFloat(row.collected) || 0,
  }))

  const defaulters = data?.defaulters ?? []

  const showQuickLinksBeside = examsEnabled

  return (
    <div className="space-y-6">
      {isError && (
        <ErrorBanner
          message="Failed to load dashboard data. Check that the Django server is running and restart it if you recently changed backend code."
        />
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading ? (
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

        {canSeeStaff && (isLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            title="Total Staff"
            value={totalStaff !== null ? totalStaff.toLocaleString() : '—'}
            icon={UserCog}
            color="bg-secondary"
            subtitle="Teaching & non-teaching"
          />
        ))}

        {examsEnabled && (isLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            title="Upcoming Exams"
            value={String(upcomingExamsCount)}
            icon={ClipboardList}
            color="bg-accent"
            subtitle={upcomingExams[0] ? `Next: ${upcomingExams[0].name}` : 'None scheduled'}
          />
        ))}

        {feesEnabled && (isLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            title="Fees Collected"
            value={feesCollected !== null ? formatTZS(feesCollected) : '—'}
            icon={CreditCard}
            color="bg-success"
            subtitle={
              data?.fees?.collection_rate_percent
                ? `${data.fees.collection_rate_percent}% collection rate`
                : 'Current year'
            }
          />
        ))}

        {feesEnabled && (isLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            title="Outstanding Fees"
            value={feesOutstanding !== null ? formatTZS(feesOutstanding) : '—'}
            icon={TrendingDown}
            color="bg-danger"
            subtitle="Unpaid + partial invoices"
          />
        ))}

        {attendanceEnabled && (isLoading ? (
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
              data?.attendance?.total_records
                ? `${data.attendance.present} present of ${data.attendance.total_records}`
                : 'No records today'
            }
          />
        ))}
      </div>

      <SchoolPerformancePanels role={role} enabledModules={enabledModules} />

      {/* ── Upcoming exams + quick links ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {examsEnabled && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Upcoming Exams</h2>
              <Link to="/exams" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : upcomingExams.length === 0 ? (
              <EmptyState icon={ClipboardList} message="No upcoming exams scheduled." />
            ) : (
              <div className="space-y-2">
                {upcomingExams.map((exam) => (
                  <div key={exam.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-gray-50/70">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{exam.name}</p>
                      <p className="text-xs text-gray-400">
                        {LEVEL_LABEL[exam.level] ?? exam.level}{exam.stream ? ` ${exam.stream}` : ''} · {exam.exam_type}
                      </p>
                    </div>
                    <div className="text-right shrink-0 text-xs text-gray-500">
                      {fmtDate(exam.start_date)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={showQuickLinksBeside ? '' : 'lg:col-span-2'}>
          <QuickLinksPanel role={role} enabledModules={enabledModules} />
        </div>
      </div>

      {/* ── Charts + defaulters grid ── */}
      {feesEnabled && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Revenue bar chart */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Monthly Revenue ({new Date().getFullYear()})
          </h2>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : isError ? (
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

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 w-24 rounded-lg" />
                </div>
              ))}
            </div>
          ) : isError ? (
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
      )}
    </div>
  )
}
