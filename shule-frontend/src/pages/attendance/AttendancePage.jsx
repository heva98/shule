import { useQuery } from '@tanstack/react-query'
import {
  CalendarCheck,
  MessageCircle,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { bulkMark, getAbsentees, getAttendance, getAttendanceSummary } from '../../api/attendance'
import { getStudents } from '../../api/students'
import Badge from '../../components/ui/Badge'
import Skeleton from '../../components/ui/Skeleton'
import Tabs from '../../components/ui/Tabs'
import { ATT_BADGE, LEVEL_LABEL } from '../../lib/constants'
import { useSchoolLevels } from '../../hooks/useSchoolLevels'

// ── Shared helpers ─────────────────────────────────────────────────────────

const today = new Date().toISOString().split('T')[0]

const STATUS_CONFIG = {
  PRESENT: {
    key: 'PRESENT', label: 'P', title: 'Present',
    idle: 'border-gray-200 text-gray-500 hover:border-green-300 hover:text-green-600 hover:bg-green-50',
    active: 'border-green-500 bg-green-500 text-white',
  },
  ABSENT: {
    key: 'ABSENT', label: 'A', title: 'Absent',
    idle: 'border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50',
    active: 'border-red-500 bg-red-500 text-white',
  },
  LATE: {
    key: 'LATE', label: 'L', title: 'Late',
    idle: 'border-gray-200 text-gray-500 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50',
    active: 'border-orange-400 bg-orange-400 text-white',
  },
  EXCUSED: {
    key: 'EXCUSED', label: 'E', title: 'Excused',
    idle: 'border-gray-200 text-gray-500 hover:border-gray-400 hover:bg-gray-100',
    active: 'border-gray-500 bg-gray-500 text-white',
  },
}

const STATUSES = Object.values(STATUS_CONFIG)

const selectCls = `border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-700
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ── Register Tab ───────────────────────────────────────────────────────────

function StatusButtons({ studentId, value, onChange }) {
  return (
    <div className="flex items-center gap-0.5">
      {STATUSES.map(({ key, label, title, idle, active }) => (
        <button
          key={key}
          type="button"
          title={title}
          onClick={() => onChange(studentId, key)}
          className={`w-7 h-7 text-xs font-bold border rounded transition-colors
            ${value === key ? active : idle}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function RegisterTab() {
  const { levelOptions } = useSchoolLevels()
  const [date,     setDate]     = useState(today)
  const [session,  setSession]  = useState('MORNING')
  const [level,    setLevel]    = useState('')
  const [stream,   setStream]   = useState('')
  const [students, setStudents] = useState([])
  const [register, setRegister] = useState({})   // {student.id: {status, reason}}
  const [loaded,   setLoaded]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function loadClass() {
    if (!level) { toast.error('Please select a level.'); return }
    setLoading(true)
    try {
      const params = { level, status: 'ACTIVE', all: 'true' }
      if (stream.trim()) params.stream = stream.trim()
      const data = await getStudents(params)
      const list = Array.isArray(data) ? data : data.results ?? []
      if (list.length === 0) {
        toast('No active students found for this selection.', { icon: 'ℹ️' })
        setLoaded(false)
        return
      }
      setStudents(list)
      const init = {}
      list.forEach((s) => { init[s.id] = { status: 'PRESENT', reason: '' } })
      setRegister(init)
      setLoaded(true)
    } catch {
      toast.error('Failed to load students.')
    } finally {
      setLoading(false)
    }
  }

  function setStatus(studentId, status) {
    setRegister((r) => ({
      ...r,
      [studentId]: { ...r[studentId], status },
    }))
  }

  function setReason(studentId, reason) {
    setRegister((r) => ({
      ...r,
      [studentId]: { ...r[studentId], reason },
    }))
  }

  async function submitRegister() {
    setSubmitting(true)
    try {
      const records = students.map((s) => ({
        student_id: s.student_id,
        status:     register[s.id]?.status ?? 'PRESENT',
        reason:     register[s.id]?.reason ?? '',
      }))
      const payload = { date, session, level, records }
      if (stream.trim()) payload.stream = stream.trim()
      const result = await bulkMark(payload)
      toast.success(result.detail ?? 'Register submitted.')
    } catch (err) {
      const detail = err.response?.data?.detail || 'Submission failed.'
      toast.error(typeof detail === 'string' ? detail : 'Submission failed.')
    } finally {
      setSubmitting(false)
    }
  }

  // Summary counts
  const counts = Object.values(register).reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc },
    {}
  )
  const nPresent = counts.PRESENT || 0
  const nAbsent  = counts.ABSENT  || 0
  const nLate    = counts.LATE    || 0
  const nExcused = counts.EXCUSED || 0

  return (
    <div className="space-y-4">
      {/* ── Controls ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setLoaded(false) }}
              className={selectCls}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Session</label>
            <select
              value={session}
              onChange={(e) => { setSession(e.target.value); setLoaded(false) }}
              className={selectCls}
            >
              <option value="MORNING">Morning</option>
              <option value="AFTERNOON">Afternoon</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Level</label>
            <select
              value={level}
              onChange={(e) => { setLevel(e.target.value); setLoaded(false) }}
              className={selectCls}
            >
              <option value="">Select level…</option>
              {levelOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Stream</label>
            <input
              type="text"
              value={stream}
              onChange={(e) => { setStream(e.target.value); setLoaded(false) }}
              className={`${selectCls} w-24`}
              placeholder="e.g. A"
            />
          </div>

          <button
            onClick={loadClass}
            disabled={loading || !level}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg
              text-sm font-medium hover:bg-secondary disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <CalendarCheck size={14} />
            )}
            {loading ? 'Loading…' : 'Load Class'}
          </button>
        </div>
      </div>

      {/* ── Register table ── */}
      {loaded && (
        <>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">
                {LEVEL_LABEL[level] ?? level}{stream ? ` · Stream ${stream.toUpperCase()}` : ''} — {date}
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {session === 'MORNING' ? 'Morning' : 'Afternoon'} session · {students.length} students
                </span>
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="w-10 px-4 py-2.5 text-xs font-medium text-gray-500 text-left">#</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-left">Student</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-left whitespace-nowrap">Student ID</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-left whitespace-nowrap">Status</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-left">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {students.map((s, i) => {
                    const row = register[s.id] ?? { status: 'PRESENT', reason: '' }
                    const showReason = row.status === 'ABSENT' || row.status === 'LATE'
                    return (
                      <tr
                        key={s.id}
                        className={`transition-colors ${
                          row.status === 'ABSENT'  ? 'bg-red-50/40' :
                          row.status === 'LATE'    ? 'bg-orange-50/40' :
                          row.status === 'EXCUSED' ? 'bg-gray-50/60' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5 text-xs text-gray-400 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-900">{s.full_name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500 whitespace-nowrap">
                          {s.student_id}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusButtons
                            studentId={s.id}
                            value={row.status}
                            onChange={setStatus}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          {showReason && (
                            <input
                              type="text"
                              value={row.reason}
                              onChange={(e) => setReason(s.id, e.target.value)}
                              placeholder="Reason (optional)"
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-1 text-xs
                                focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Summary + Submit ── */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white rounded-xl
            border border-gray-100 shadow-sm px-5 py-3">
            <div className="flex items-center gap-5 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                <span className="font-semibold text-green-700">{nPresent}</span>
                <span className="text-gray-400">present</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                <span className="font-semibold text-red-600">{nAbsent}</span>
                <span className="text-gray-400">absent</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" />
                <span className="font-semibold text-orange-600">{nLate}</span>
                <span className="text-gray-400">late</span>
              </span>
              {nExcused > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />
                  <span className="font-semibold text-gray-600">{nExcused}</span>
                  <span className="text-gray-400">excused</span>
                </span>
              )}
            </div>
            <button
              onClick={submitRegister}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg
                text-sm font-medium hover:bg-secondary disabled:opacity-60 transition-colors"
            >
              {submitting && <RefreshCw size={13} className="animate-spin" />}
              {submitting ? 'Submitting…' : 'Submit Register'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Reports Tab ────────────────────────────────────────────────────────────

function StudentSearchCombobox({ value, onChange }) {
  const [query,      setQuery]      = useState('')
  const [debouncedQ, setDebounced]  = useState('')
  const [open,       setOpen]       = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 350)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const { data, isFetching } = useQuery({
    queryKey: ['students-search', debouncedQ],
    queryFn:  () => getStudents({ search: debouncedQ, status: 'ACTIVE' }),
    enabled:  debouncedQ.length >= 2,
  })
  const results = data?.results ?? []

  function select(student) {
    onChange(student)
    setQuery(student.full_name)
    setOpen(false)
  }

  function clear() {
    onChange(null)
    setQuery('')
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={value ? value.full_name : query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange(null) }}
          onFocus={() => { if (!value && debouncedQ.length >= 2) setOpen(true) }}
          placeholder="Search student by name or ID…"
          className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm
            focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        {(value || query) && (
          <button
            onClick={clear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
          >
            ×
          </button>
        )}
      </div>

      {open && debouncedQ.length >= 2 && !value && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-gray-200
          shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {isFetching ? (
            <div className="px-4 py-3 text-sm text-gray-400">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">No students found.</div>
          ) : (
            results.map((s) => (
              <button
                key={s.id}
                onClick={() => select(s)}
                className="w-full text-left px-4 py-2.5 hover:bg-primary/5 transition-colors"
              >
                <span className="text-sm font-medium text-gray-900">{s.full_name}</span>
                <span className="ml-2 text-xs text-gray-400 font-mono">{s.student_id}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function AttendanceBar({ pct }) {
  const color =
    pct >= 80 ? 'bg-green-500' :
    pct >= 60 ? 'bg-yellow-400' :
    'bg-red-500'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div
          className={`h-3 rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className={`text-sm font-semibold tabular-nums w-12 text-right
        ${pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
        {pct}%
      </span>
      {pct < 80 && (
        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
          Low
        </span>
      )}
    </div>
  )
}

function ReportsTab() {
  const nowDate  = new Date()
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [month, setMonth] = useState(nowDate.getMonth() + 1)
  const [year,  setYear]  = useState(nowDate.getFullYear())

  const currentYear = nowDate.getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  const sid = selectedStudent?.id

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['att-summary-report', sid, month, year],
    queryFn:  () => getAttendanceSummary(sid, month, year),
    enabled:  !!sid,
  })

  const { data: records, isLoading: recLoading } = useQuery({
    queryKey: ['att-records-report', sid, month, year],
    queryFn:  () => getAttendance({ student: sid, month, year }),
    enabled:  !!sid,
  })

  const rows = records?.results ?? records ?? []
  const pct  = Number(summary?.attendance_percent ?? 0)

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Student</label>
            <StudentSearchCombobox value={selectedStudent} onChange={setSelectedStudent} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className={selectCls}
            >
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={selectCls}
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!selectedStudent && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <Search size={32} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">Search for a student to view their attendance report.</p>
        </div>
      )}

      {selectedStudent && (
        <>
          {/* Summary card */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold text-gray-900">{selectedStudent.full_name}</p>
                <p className="text-xs text-gray-400 font-mono">{selectedStudent.student_id}</p>
              </div>
              <p className="text-sm text-gray-500">
                {MONTHS[month - 1]} {year}
              </p>
            </div>

            {sumLoading ? (
              <Skeleton className="h-4 w-full rounded-full" />
            ) : summary ? (
              <>
                <AttendanceBar pct={Number(pct)} />
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    { label: 'Total Days', value: summary.total_days, color: 'text-gray-700' },
                    { label: 'Present',    value: summary.present,    color: 'text-green-600' },
                    { label: 'Absent',     value: summary.absent,     color: 'text-red-600' },
                    { label: 'Late',       value: summary.late,       color: 'text-orange-600' },
                    { label: 'Excused',    value: summary.excused,    color: 'text-gray-500' },
                  ].map((s) => (
                    <div key={s.label} className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-xs text-gray-400">{s.label}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No attendance data for this period.</p>
            )}
          </div>

          {/* Daily records */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-700">Daily Records</p>
            </div>
            {recLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-lg" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-400">
                No records for {MONTHS[month - 1]} {year}.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {['Date', 'Session', 'Status', 'Reason', 'Marked by'].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50/40 transition-colors">
                      <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{r.date}</td>
                      <td className="px-4 py-2.5 text-gray-500 capitalize">
                        {r.session?.toLowerCase()}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge label={r.status} colorClass={ATT_BADGE[r.status]} />
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs max-w-[160px] truncate">
                        {r.reason || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        {r.marked_by_name || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Absentees Tab ──────────────────────────────────────────────────────────

function AbsenteesTab() {
  const { levelOptions } = useSchoolLevels()
  const [date,  setDate]  = useState(today)
  const [level, setLevel] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['absentees', date, level],
    queryFn:  () => getAbsentees(date, level || undefined),
  })
  const absentees = Array.isArray(data) ? data : []

  function waLink(absentee) {
    const phone = absentee.guardian_phone?.replace(/\D/g, '')
    if (!phone) return null
    const guardianName = absentee.guardian_name || 'Mzazi'
    const msg = encodeURIComponent(
      `Habari ${guardianName}, mtoto wako ${absentee.student_name} hakuhudhuria shule leo. Tafadhali wasiliana nasi.`
    )
    return `https://wa.me/${phone}?text=${msg}`
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={selectCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Level</label>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className={selectCls}>
              <option value="">All Levels</option>
              {levelOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg
              text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">
            Absent Students — {date}
          </p>
          {!isLoading && absentees.length > 0 && (
            <span className="text-xs bg-red-100 text-red-700 px-2.5 py-0.5 rounded-full font-medium">
              {absentees.length} absent
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <p className="px-4 py-10 text-center text-sm text-danger">
            Failed to load. Check that the date is correct.
          </p>
        ) : absentees.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-gray-400">
              No absences recorded for {date}.
            </p>
            <p className="text-xs text-gray-300 mt-1">
              Run the morning register first to see absentees here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {['Name', 'Level', 'Stream', 'Guardian', 'Phone', 'Reason', ''].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {absentees.map((a) => {
                  const link = waLink(a)
                  return (
                    <tr key={a.student_id} className="hover:bg-red-50/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{a.student_name}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {LEVEL_LABEL[a.level] ?? a.level}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{a.stream || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{a.guardian_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs whitespace-nowrap">
                        {a.guardian_phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-[140px] truncate">
                        {a.reason || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-white bg-[#25D366]
                              rounded-lg px-2.5 py-1.5 hover:bg-[#1ebe5d] transition-colors whitespace-nowrap"
                          >
                            <MessageCircle size={12} />
                            Notify
                          </a>
                        ) : (
                          <span className="text-xs text-gray-300">No phone</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

const PAGE_TABS = [
  { id: 'register',  label: 'Register' },
  { id: 'reports',   label: 'Reports' },
  { id: 'absentees', label: "Today's Absentees" },
]

export default function AttendancePage() {
  const [activeTab, setActiveTab] = useState('register')

  return (
    <div className="space-y-5">
      <Tabs tabs={PAGE_TABS} active={activeTab} onChange={setActiveTab} />
      {activeTab === 'register'  && <RegisterTab />}
      {activeTab === 'reports'   && <ReportsTab />}
      {activeTab === 'absentees' && <AbsenteesTab />}
    </div>
  )
}
