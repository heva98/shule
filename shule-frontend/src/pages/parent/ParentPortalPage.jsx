import { useQuery } from '@tanstack/react-query'
import {
  BedDouble,
  Bell,
  BookOpen,
  Bus,
  Calendar,
  CheckCircle,
  Download,
  GraduationCap,
  LogOut,
  MessageCircle,
  Package,
  Smartphone,
  Wallet,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { getAnnouncements } from '../../api/communications'
import { getReportCard, getExams } from '../../api/exams'
import { getInvoices } from '../../api/fees'
import { getAttendanceSummary, getAttendance } from '../../api/attendance'
import { getHomePackages } from '../../api/homepackages'
import { getBoardingAssignments } from '../../api/boarding'
import { getTransportAssignments } from '../../api/transport'
import { getMyChildren } from '../../api/students'
import Skeleton from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { GRADE_BADGE, INVOICE_BADGE, LEVEL_LABEL } from '../../lib/constants'

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name) {
  return (name ?? '')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

function ordinal(n) {
  if (!n) return '—'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function gradeFromScore(score) {
  const s = parseFloat(score)
  if (isNaN(s)) return ''
  if (s >= 75) return 'A'
  if (s >= 60) return 'B'
  if (s >= 45) return 'C'
  if (s >= 30) return 'D'
  return 'F'
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short' })
  } catch {
    return iso
  }
}

// ── Print report card ─────────────────────────────────────────────────────────

function printReportCard(rc) {
  if (!rc) return
  const student = rc.student ?? {}
  const exam    = rc.exam    ?? {}
  const summary = rc.summary ?? {}
  const rows    = (rc.subjects ?? [])
    .map((s) => {
      const g = s.grade || gradeFromScore(s.score)
      return `<tr>
        <td>${s.subject_code}</td><td>${s.subject_name}</td>
        <td style="text-align:center">${s.score}</td>
        <td style="text-align:center;font-weight:700">${g}</td>
        <td>${s.remarks || ''}</td>
      </tr>`
    })
    .join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Report Card – ${student.full_name}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:13px;padding:24px;color:#111}
    h1{color:#1B4F72;font-size:18px;margin-bottom:4px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;
      border:1px solid #ddd;padding:10px;border-radius:6px;margin:12px 0;background:#f9f9f9}
    .meta span{font-size:12px}
    table{width:100%;border-collapse:collapse;margin:12px 0}
    th{background:#1B4F72;color:#fff;padding:7px;font-size:12px;text-align:left}
    td{padding:6px;border-bottom:1px solid #eee;font-size:12px}
    tr:nth-child(even) td{background:#f5f5f5}
    .sum{display:flex;gap:20px;flex-wrap:wrap;border:1px solid #c8dced;
      border-radius:6px;padding:10px;background:#eaf3fb;margin:10px 0}
    .sum span{font-size:12px}
    @media print{body{padding:10px}}
  </style></head><body>
  <h1>Shule SMS — Student Report Card</h1>
  <div class="meta">
    <span><strong>Name:</strong> ${student.full_name}</span>
    <span><strong>ID:</strong> ${student.student_id}</span>
    <span><strong>Level:</strong> ${student.level}${student.stream ? ' / ' + student.stream : ''}</span>
    <span><strong>Exam:</strong> ${exam.name}</span>
    <span><strong>Term:</strong> ${(exam.term || '').replace('TERM', 'Term ')}</span>
    <span><strong>Year:</strong> ${exam.academic_year}</span>
  </div>
  <table><thead><tr>
    <th style="width:60px">Code</th><th>Subject</th>
    <th style="width:60px">Score</th><th style="width:50px">Grade</th><th>Remarks</th>
  </tr></thead><tbody>${rows}</tbody></table>
  <div class="sum">
    <span><strong>Total:</strong> ${summary.total_score}</span>
    <span><strong>Average:</strong> ${summary.average_score}</span>
    <span><strong>Position:</strong> ${ordinal(summary.position)} / ${summary.class_size}</span>
    ${summary.division ? `<span><strong>Division:</strong> ${summary.division}</span>` : ''}
    ${summary.aggregate != null ? `<span><strong>Aggregate:</strong> ${summary.aggregate}</span>` : ''}
  </div>
  </body></html>`

  const w = window.open('', '_blank', 'width=800,height=900')
  if (!w) { toast.error('Please allow popups to download.'); return }
  w.document.write(html)
  w.document.close()
  setTimeout(() => { w.print(); w.close() }, 400)
}

// ── ChildCard ─────────────────────────────────────────────────────────────────

function ChildCard({ child, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 w-[116px] p-3 rounded-2xl border-2 text-center transition-all
        active:scale-95
        ${selected
          ? 'border-primary bg-primary/5 shadow-md'
          : 'border-gray-100 bg-white shadow-sm hover:border-primary/40'}`}
    >
      <div className={`w-11 h-11 rounded-full overflow-hidden flex items-center justify-center
        text-sm font-bold mb-2 mx-auto
        ${selected ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
        {child.photo
          ? <img src={child.photo} alt={child.full_name} className="w-full h-full object-cover" />
          : initials(child.full_name)}
      </div>
      <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2">
        {child.full_name}
      </p>
      <p className={`text-[10px] mt-1 font-medium
        ${selected ? 'text-primary' : 'text-gray-400'}`}>
        {LEVEL_LABEL[child.level] ?? child.level}
        {child.stream ? ` ${child.stream}` : ''}
      </p>
    </button>
  )
}

// ── Fees Tab ──────────────────────────────────────────────────────────────────

function FeesTab({ child }) {
  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ['parent-invoices', child.id],
    queryFn: () => getInvoices({ student: child.id }),
  })
  const invoices = invoicesData?.results ?? invoicesData ?? []
  const latest   = invoices[0]
  const balance  = parseFloat(latest?.balance ?? 0)
  const isOwing  = balance > 0

  const waText   = encodeURIComponent(
    `Habari, mimi ni mzazi wa ${child.full_name}. Ninahitaji msaada kuhusu ada.`
  )
  // Replace with actual school WhatsApp number
  const schoolWa = `https://wa.me/255700000000?text=${waText}`

  if (isLoading) return <TabSkeleton />

  return (
    <div className="space-y-4">
      {/* Balance hero */}
      {latest ? (
        <div className={`rounded-2xl p-5 text-center
          ${isOwing ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
          <p className="text-xs text-gray-500 mb-1">Outstanding Balance</p>
          <p className={`text-4xl font-bold tracking-tight
            ${isOwing ? 'text-red-600' : 'text-green-600'}`}>
            {new Intl.NumberFormat('en-TZ').format(balance)}
          </p>
          <p className="text-sm text-gray-400 mt-0.5">TZS</p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium
              ${INVOICE_BADGE[latest.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {latest.status}
            </span>
            <span className="text-xs text-gray-400">
              {latest.term?.replace('TERM', 'Term ')} · {latest.academic_year_label}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-center py-6 text-sm text-gray-400">No invoices found.</p>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          disabled
          title="Coming soon"
          className="flex items-center justify-center gap-2 min-h-[48px] rounded-xl
            bg-gray-100 text-gray-400 text-sm font-medium cursor-not-allowed select-none"
        >
          <Smartphone size={15} />
          M-Pesa
          <span className="text-[9px] px-1.5 py-0.5 bg-gray-200 rounded ml-0.5">Soon</span>
        </button>
        <a
          href={schoolWa}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 min-h-[48px] rounded-xl
            bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
        >
          <MessageCircle size={15} />
          Contact School
        </a>
      </div>

      {/* Invoice history */}
      {invoices.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Invoice History
          </p>
          <div className="space-y-2">
            {invoices.slice(0, 8).map((inv) => (
              <div key={inv.id}
                className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-gray-800">
                    {inv.term?.replace('TERM', 'Term ')} {inv.academic_year_label}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Due {inv.due_date}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">
                    {new Intl.NumberFormat('en-TZ').format(parseFloat(inv.balance ?? 0))}
                  </p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium
                    ${INVOICE_BADGE[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {inv.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Results Tab ───────────────────────────────────────────────────────────────

function ResultsTab({ child }) {
  const [examId, setExamId] = useState('')

  const { data: examsData, isLoading: examsLoading } = useQuery({
    queryKey: ['parent-exams', child.level],
    queryFn: () => getExams({ level: child.level }),
    enabled: !!child.level,
  })
  const exams = examsData?.results ?? examsData ?? []

  const { data: rc, isLoading: rcLoading } = useQuery({
    queryKey: ['parent-rc', child.public_id, examId],
    queryFn: () => getReportCard(child.public_id, examId),
    enabled: !!examId,
  })

  return (
    <div className="space-y-4">
      <select
        value={examId}
        onChange={(e) => setExamId(e.target.value)}
        disabled={examsLoading}
        className="w-full border border-gray-300 rounded-xl px-3 min-h-[48px] text-sm bg-white
          focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      >
        <option value="">{examsLoading ? 'Loading exams…' : 'Select an exam…'}</option>
        {exams.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} — {e.term?.replace('TERM', 'Term ')}
          </option>
        ))}
      </select>

      {rcLoading && <TabSkeleton />}

      {rc && !rcLoading && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-primary">
                {ordinal(rc.summary?.position)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                of {rc.summary?.class_size} students
              </p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{rc.summary?.average_score}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Average Score</p>
            </div>
            {rc.summary?.division && (
              <div className="col-span-2 bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-blue-700">Division {rc.summary.division}</p>
              </div>
            )}
            {rc.summary?.aggregate != null && (
              <div className="col-span-2 bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-blue-700">
                  Aggregate: {rc.summary.aggregate}
                </p>
              </div>
            )}
          </div>

          {/* Download */}
          <button
            onClick={() => printReportCard(rc)}
            className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl
              bg-primary text-white text-sm font-medium hover:bg-secondary transition-colors"
          >
            <Download size={16} />
            Download Report Card
          </button>

          {/* Subject rows */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Subjects</p>
            {(rc.subjects ?? []).map((s, i) => {
              const g = s.grade || gradeFromScore(s.score)
              return (
                <div key={i}
                  className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                  <span className="text-[10px] font-mono text-gray-400 w-9 shrink-0">
                    {s.subject_code}
                  </span>
                  <span className="flex-1 text-xs font-medium text-gray-800 truncate">
                    {s.subject_name}
                  </span>
                  <span className="text-sm font-mono tabular-nums text-gray-900 w-8 text-right">
                    {s.score}
                  </span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded w-7 text-center
                    ${GRADE_BADGE[g] ?? 'bg-gray-100 text-gray-600'}`}>
                    {g}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!examId && !examsLoading && exams.length > 0 && (
        <p className="text-center py-6 text-sm text-gray-400">
          Select an exam above to view results.
        </p>
      )}
      {!examsLoading && exams.length === 0 && (
        <p className="text-center py-6 text-sm text-gray-400">
          No exams found for this level yet.
        </p>
      )}
    </div>
  )
}

// ── Attendance Tab ────────────────────────────────────────────────────────────

function AttendanceTab({ child }) {
  const now   = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['parent-att-sum', child.id, month, year],
    queryFn: () => getAttendanceSummary(child.id, month, year),
  })

  const { data: absData, isLoading: absLoading } = useQuery({
    queryKey: ['parent-att-abs', child.id, month, year],
    queryFn: () => getAttendance({ student: child.id, month, year, status: 'ABSENT', all: 'true' }),
  })
  const absences = (absData?.results ?? absData ?? [])
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 12)

  if (sumLoading || absLoading) return <TabSkeleton />

  const pct      = parseFloat(summary?.attendance_percent ?? 0)
  const barColor = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'
  const pctColor = pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600'
  const monthName = now.toLocaleString('default', { month: 'long' })

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="bg-gray-50 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-700">{monthName} {year}</p>
          <p className={`text-2xl font-bold ${pctColor}`}>{pct}%</p>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        {pct < 80 && (
          <p className="text-[11px] text-red-500 mt-1.5">
            Below recommended 80% attendance.
          </p>
        )}

        <div className="grid grid-cols-4 gap-2 mt-4">
          {[
            { label: 'Present', val: summary?.present  ?? 0, color: 'text-green-600' },
            { label: 'Absent',  val: summary?.absent   ?? 0, color: 'text-red-600' },
            { label: 'Late',    val: summary?.late     ?? 0, color: 'text-yellow-600' },
            { label: 'Excused', val: summary?.excused  ?? 0, color: 'text-blue-600' },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
              <p className="text-[10px] text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Absences */}
      {absences.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Absences This Month
          </p>
          <div className="space-y-2">
            {absences.map((r, i) => (
              <div key={i}
                className="flex items-center justify-between bg-red-50 border border-red-100
                  rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <XCircle size={14} className="text-red-400 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-800">{r.date}</p>
                    {r.reason && (
                      <p className="text-[11px] text-gray-400 mt-0.5">{r.reason}</p>
                    )}
                  </div>
                </div>
                <span className="text-[11px] text-gray-400 capitalize">
                  {r.session?.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-6">
          <CheckCircle size={32} className="mx-auto text-green-400 mb-2" />
          <p className="text-sm text-gray-500">No absences this month!</p>
        </div>
      )}
    </div>
  )
}

function BoardingBadge({ child }) {
  const { data } = useQuery({
    queryKey: ['parent-boarding', child.id],
    queryFn: () => getBoardingAssignments({ student: child.id, active: 'true' }),
  })
  const assignment = (data?.results ?? data ?? [])[0]
  if (!assignment) return null

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 bg-primary/5 border-b border-gray-100 text-xs text-primary">
      <BedDouble size={13} />
      Boarding at <strong>{assignment.dormitory_name}</strong>
      {assignment.bed_number && <span>· Bed {assignment.bed_number}</span>}
    </div>
  )
}

function TransportBadge({ child }) {
  const { data } = useQuery({
    queryKey: ['parent-transport', child.id],
    queryFn: () => getTransportAssignments({ student: child.id, active: 'true' }),
  })
  const assignment = (data?.results ?? data ?? [])[0]
  if (!assignment) return null

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 bg-primary/5 border-b border-gray-100 text-xs text-primary">
      <Bus size={13} />
      On <strong>{assignment.route_name}</strong>
      {assignment.pickup_point_name && <span>· {assignment.pickup_point_name}</span>}
    </div>
  )
}

function PackagesTab({ child }) {
  const { data, isLoading } = useQuery({
    queryKey: ['parent-home-packages', child.id, child.level, child.stream],
    queryFn: () => getHomePackages({ level: child.level, stream: child.stream || undefined }),
  })
  const packages = data?.results ?? data ?? []

  if (isLoading) return <TabSkeleton />

  if (packages.length === 0) {
    return (
      <div className="text-center py-6">
        <Package size={32} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">No home packages yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {packages.map((pkg) => (
        <div key={pkg.id} className="bg-gray-50 rounded-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">{pkg.title}</p>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium shrink-0">
              {pkg.quarter}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{pkg.subject_code} &middot; Due {fmtDate(pkg.due_date)}</p>
          {pkg.instructions && <p className="text-xs text-gray-600 mt-2">{pkg.instructions}</p>}
          {pkg.attachment && (
            <a href={pkg.attachment} target="_blank" rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
              <Download size={12} /> Download attachment
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Tab skeleton ──────────────────────────────────────────────────────────────

function TabSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
    </div>
  )
}

// ── Announcements ─────────────────────────────────────────────────────────────

const READ_KEY = (uid) => `parent-read-${uid}`

function AnnouncementsSection({ level, userId }) {
  const [readIds, setReadIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(READ_KEY(userId)) ?? '[]'))
    } catch {
      return new Set()
    }
  })

  const { data, isLoading } = useQuery({
    queryKey: ['announcements', level],
    queryFn: () => getAnnouncements(level),
    staleTime: 2 * 60 * 1000,
  })
  const items  = data ?? []
  const unread = items.filter((a) => !readIds.has(a.id)).length

  function markRead(id) {
    setReadIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      try {
        localStorage.setItem(READ_KEY(userId), JSON.stringify([...next]))
      } catch { /* storage full */ }
      return next
    })
  }

  return (
    <section className="pb-8">
      <div className="flex items-center gap-2 mb-3">
        <Bell size={15} className="text-gray-400" />
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
          Announcements
        </h2>
        {unread > 0 && (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white
            text-[10px] flex items-center justify-center font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
          <p className="text-sm text-gray-400">No announcements yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => {
            const isRead = readIds.has(a.id)
            return (
              <button
                key={a.id}
                onClick={() => markRead(a.id)}
                className={`w-full text-left rounded-xl p-4 border transition-colors
                  ${isRead ? 'bg-white border-gray-100' : 'bg-blue-50 border-blue-100'}`}
              >
                <div className="flex items-start gap-2">
                  {!isRead && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-900 truncate">
                        {a.subject || 'Announcement'}
                      </span>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {fmtDate(a.sent_at)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{a.body}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'fees',       label: 'Fees',       Icon: Wallet },
  { key: 'results',    label: 'Results',    Icon: BookOpen },
  { key: 'attendance', label: 'Attendance', Icon: Calendar },
  { key: 'packages',   label: 'Packages',   Icon: Package },
]

export default function ParentPortalPage() {
  const { user, logout } = useAuth()
  const [selectedChildId, setSelectedChildId] = useState(null)
  const [activeTab, setActiveTab]             = useState('fees')

  const { data: childrenData, isLoading: childrenLoading } = useQuery({
    queryKey: ['my-children'],
    queryFn: getMyChildren,
    staleTime: 5 * 60 * 1000,
  })
  const children      = childrenData ?? []
  const selectedChild = children.find((c) => c.id === selectedChildId) ?? null

  function handleSelectChild(childId) {
    setSelectedChildId((prev) => (prev === childId ? null : childId))
    setActiveTab('fees')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top navbar ── */}
      <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-primary text-white
        flex items-center justify-between px-4 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
            <GraduationCap size={16} />
          </div>
          <span className="font-semibold text-sm">Shule Portal</span>
        </div>
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs text-white/80 truncate max-w-[120px]">
            {user?.full_name}
          </span>
          <button
            onClick={logout}
            title="Log out"
            className="p-2 rounded-lg hover:bg-white/10 transition-colors ml-1 shrink-0"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="pt-14 max-w-2xl mx-auto px-4 space-y-5 pb-10">

        {/* Children */}
        <section className="pt-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
            My Children
          </h2>

          {childrenLoading ? (
            <div className="flex gap-3">
              {[1, 2].map((i) => (
                <div key={i} className="w-[116px] h-28 bg-gray-200 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : children.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <GraduationCap size={32} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-500">No children linked to your account.</p>
              <p className="text-xs text-gray-400 mt-1">
                Contact the school office to link your account.
              </p>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
              {children.map((child) => (
                <ChildCard
                  key={child.id}
                  child={child}
                  selected={selectedChildId === child.id}
                  onClick={() => handleSelectChild(child.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Child detail */}
        {selectedChild && (
          <section>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Child header */}
              <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 bg-gray-50/60">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center
                  justify-center text-base font-bold overflow-hidden shrink-0">
                  {selectedChild.photo
                    ? <img src={selectedChild.photo} alt={selectedChild.full_name}
                        className="w-full h-full object-cover" />
                    : initials(selectedChild.full_name)}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{selectedChild.full_name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {LEVEL_LABEL[selectedChild.level] ?? selectedChild.level}
                    {selectedChild.stream ? ` · Stream ${selectedChild.stream}` : ''}
                    {' · '}
                    <span className="font-mono">{selectedChild.student_id}</span>
                  </p>
                </div>
              </div>

              <BoardingBadge child={selectedChild} />
              <TransportBadge child={selectedChild} />

              {/* Tab bar */}
              <div className="flex border-b border-gray-100">
                {TABS.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium
                      transition-colors min-h-[52px]
                      ${activeTab === key
                        ? 'border-b-2 border-primary text-primary bg-primary/3'
                        : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="p-4">
                {activeTab === 'fees'       && <FeesTab       child={selectedChild} />}
                {activeTab === 'results'    && <ResultsTab    child={selectedChild} />}
                {activeTab === 'attendance' && <AttendanceTab child={selectedChild} />}
                {activeTab === 'packages'   && <PackagesTab   child={selectedChild} />}
              </div>
            </div>
          </section>
        )}

        {/* Announcements */}
        <AnnouncementsSection
          level={selectedChild?.level}
          userId={user?.id}
        />
      </main>
    </div>
  )
}
