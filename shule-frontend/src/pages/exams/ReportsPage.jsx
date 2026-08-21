import { useQuery } from '@tanstack/react-query'
import {
  FileBarChart2,
  Printer,
  Trophy,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  getClassPerformance,
  getExams,
  getMySubjects,
  getSubjectPerformance,
  getSubjects,
} from '../../api/exams'
import Badge from '../../components/ui/Badge'
import Skeleton from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { useSchoolLevels } from '../../hooks/useSchoolLevels'
import { GRADE_BADGE, LEVEL_LABEL } from '../../lib/constants'

const selectCls = `border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-700
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

const inputCls = `border border-gray-300 rounded-lg px-3 py-2 text-sm
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

// ── Print helper ─────────────────────────────────────────────────────────────
// Shared by both report types so the "Reports" module doesn't grow yet
// another bespoke print-HTML builder alongside the ones report cards already
// have — one printable-table template, callers just supply rows/columns.

function buildReportPrintHtml({ title, subtitle, metaLines, columns, rows, summaryLines }) {
  const head = columns.map((c) => `<th style="${c.center ? 'text-align:center' : ''}">${c.label}</th>`).join('')
  const body = rows
    .map(
      (r) =>
        `<tr>${columns
          .map((c) => `<td style="${c.center ? 'text-align:center' : ''}">${r[c.key] ?? '—'}</td>`)
          .join('')}</tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12.5px; color: #111; padding: 28px; }
  .header { text-align: center; border-bottom: 2px solid #1B4F72; padding-bottom: 12px; margin-bottom: 14px; }
  .header h1 { font-size: 18px; color: #1B4F72; letter-spacing: 0.5px; }
  .header p { font-size: 12px; color: #555; margin-top: 3px; }
  .meta { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 14px; font-size: 12px; color: #444; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #1B4F72; color: #fff; padding: 6px 8px; text-align: left; font-size: 11.5px; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 12px; }
  tr:nth-child(even) td { background: #f4f8fb; }
  .summary { display: flex; gap: 20px; flex-wrap: wrap; border: 1px solid #c8dced; border-radius: 6px;
             padding: 10px 14px; background: #eaf3fb; font-size: 12px; }
  .summary strong { color: #1B4F72; }
  @media print { body { padding: 14px; } }
</style>
</head>
<body>
  <div class="header">
    <h1>SHULE MANAGEMENT SYSTEM</h1>
    <p>${subtitle}</p>
  </div>
  <div class="meta">${metaLines.map((m) => `<span><strong>${m[0]}:</strong> ${m[1]}</span>`).join('')}</div>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  ${summaryLines?.length ? `<div class="summary">${summaryLines.map((s) => `<span><strong>${s[0]}:</strong> ${s[1]}</span>`).join('')}</div>` : ''}
</body>
</html>`
}

function printReport(html) {
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) return
  w.document.write(html)
  w.document.close()
  setTimeout(() => { w.print() }, 400)
}

// ── Shared filter controls ────────────────────────────────────────────────────

function FiltersBar({ children }) {
  return <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-4">{children}</div>
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  )
}

// ── Class Performance report ──────────────────────────────────────────────────

function ClassPerformanceReport({ role, exams, levelOptions }) {
  const isClassTeacher = role === 'CLASS_TEACHER'
  const [examId, setExamId] = useState('')
  const [level, setLevel] = useState('')
  const [stream, setStream] = useState('')

  const canQuery = !!examId && (isClassTeacher || !!level)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['class-performance', examId, level, stream, isClassTeacher],
    queryFn: () => getClassPerformance({
      exam_id: examId,
      ...(isClassTeacher ? {} : { level, stream: stream || undefined }),
    }),
    enabled: canQuery,
  })

  const classSubjects = useMemo(() => {
    const seen = new Map()
    ;(data?.students ?? []).forEach((s) => {
      s.subjects.forEach((sub) => {
        if (!seen.has(sub.code)) seen.set(sub.code, sub)
      })
    })
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [data])

  function handlePrint() {
    if (!data) return
    const exam = data.exam ?? {}
    const columns = [
      { key: 'position', label: 'Pos', center: true },
      { key: 'student', label: 'Student' },
      ...classSubjects.map((s) => ({ key: `sub_${s.code}`, label: s.code, center: true })),
      { key: 'total_marks', label: 'Total', center: true },
      { key: 'average', label: 'Avg', center: true },
      { key: 'attendance_pct', label: 'Att %', center: true },
    ]
    const rows = data.students.map((s) => {
      const map = {}
      s.subjects.forEach((sub) => { map[`sub_${sub.code}`] = sub.score }, {})
      return {
        position: s.position,
        student: `${s.full_name} (${s.student_id})`,
        ...map,
        total_marks: s.total_marks,
        average: s.average,
        attendance_pct: `${s.attendance_pct}%`,
      }
    })
    printReport(buildReportPrintHtml({
      title: `Class Performance — ${exam.name ?? ''}`,
      subtitle: 'Class Performance Report',
      metaLines: [
        ['Exam', exam.name ?? ''],
        ['Level', `${LEVEL_LABEL[data.level] ?? data.level}${data.stream ? ` / Stream ${data.stream}` : ''}`],
        ['Term', (exam.term ?? '').replace('TERM', 'Term ')],
      ],
      columns,
      rows,
      summaryLines: [['Students', String(data.count)]],
    }))
  }

  return (
    <div className="space-y-5">
      <FiltersBar>
        <Field label="Exam">
          <select value={examId} onChange={(e) => setExamId(e.target.value)} className={selectCls}>
            <option value="">Select exam…</option>
            {exams.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
          </select>
        </Field>
        {!isClassTeacher && (
          <>
            <Field label="Level">
              <select value={level} onChange={(e) => setLevel(e.target.value)} className={selectCls}>
                <option value="">Select level…</option>
                {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Stream (optional)">
              <input value={stream} onChange={(e) => setStream(e.target.value)} className={inputCls} placeholder="e.g. A" />
            </Field>
          </>
        )}
        {data && (
          <button
            onClick={handlePrint}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg
              text-sm font-medium hover:bg-secondary transition-colors"
          >
            <Printer size={14} />
            Print
          </button>
        )}
      </FiltersBar>

      {!canQuery ? (
        <EmptyHint text={isClassTeacher ? 'Select an exam to view your class performance.' : 'Select an exam and level to view class performance.'} />
      ) : isLoading ? (
        <ReportSkeleton />
      ) : isError ? (
        <ErrorHint text={error?.response?.data?.detail ?? 'Failed to load class performance.'} />
      ) : !data?.students?.length ? (
        <EmptyHint text="No marks entered for this class in this exam yet." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-left">Pos</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-left">Student</th>
                  {classSubjects.map((s) => (
                    <th key={s.code} className="px-3 py-3 text-xs font-medium text-gray-500 text-center whitespace-nowrap">{s.code}</th>
                  ))}
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-center">Total</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-center">Avg</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-center">Att %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.students.map((s) => {
                  const map = {}
                  s.subjects.forEach((sub) => { map[sub.code] = sub })
                  return (
                    <tr key={s.student_id} className="hover:bg-gray-50/40">
                      <td className="px-4 py-2.5 font-bold text-gray-700">{s.position}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900">{s.full_name}</div>
                        <div className="text-xs text-gray-400 font-mono">{s.student_id}</div>
                      </td>
                      {classSubjects.map((sub) => {
                        const m = map[sub.code]
                        return (
                          <td key={sub.code} className="px-3 py-2.5 text-center whitespace-nowrap">
                            {m ? (
                              <div>
                                <div className="font-mono text-xs text-gray-700">{parseFloat(m.score).toFixed(0)}</div>
                                <Badge label={m.grade} colorClass={GRADE_BADGE[m.grade]} />
                              </div>
                            ) : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2.5 text-center font-mono font-semibold text-gray-800">{parseFloat(s.total_marks).toFixed(0)}</td>
                      <td className="px-3 py-2.5 text-center font-mono text-gray-700">{parseFloat(s.average).toFixed(1)}</td>
                      <td className="px-3 py-2.5 text-center text-gray-700">{s.attendance_pct}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Subject Performance report ────────────────────────────────────────────────

function SubjectPerformanceReport({ role, exams, levelOptions }) {
  const isSubjectTeacher = role === 'SUBJECT_TEACHER'
  const isClassTeacher = role === 'CLASS_TEACHER'
  const [examId, setExamId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [level, setLevel] = useState('')
  const [stream, setStream] = useState('')

  const { data: subjectsData } = useQuery({
    queryKey: ['subjects-for-report', isSubjectTeacher],
    queryFn: () => (isSubjectTeacher ? getMySubjects() : getSubjects({ all: 'true' })),
  })
  const subjects = subjectsData?.results ?? subjectsData ?? []

  const canQuery = !!examId && !!subjectId && (isClassTeacher || !!level)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['subject-performance', examId, subjectId, level, stream, isClassTeacher],
    queryFn: () => getSubjectPerformance({
      exam_id: examId,
      subject_id: subjectId,
      ...(isClassTeacher ? {} : { level, stream: stream || undefined }),
    }),
    enabled: canQuery,
  })

  function handlePrint() {
    if (!data) return
    const exam = data.exam ?? {}
    const stats = data.stats ?? {}
    printReport(buildReportPrintHtml({
      title: `Subject Performance — ${data.subject?.name ?? ''}`,
      subtitle: 'Subject Performance Report',
      metaLines: [
        ['Exam', exam.name ?? ''],
        ['Subject', `${data.subject?.name ?? ''} (${data.subject?.code ?? ''})`],
        ['Level', `${LEVEL_LABEL[data.level] ?? data.level}${data.stream ? ` / Stream ${data.stream}` : ''}`],
      ],
      columns: [
        { key: 'position', label: 'Pos', center: true },
        { key: 'student', label: 'Student' },
        { key: 'score', label: 'Score', center: true },
        { key: 'grade', label: 'Grade', center: true },
        { key: 'remarks', label: 'Remarks' },
      ],
      rows: data.students.map((s) => ({
        position: s.position,
        student: `${s.full_name} (${s.student_id})`,
        score: parseFloat(s.score).toFixed(0),
        grade: s.grade,
        remarks: s.remarks || '—',
      })),
      summaryLines: [
        ['Students', String(stats.count ?? 0)],
        ['Average', stats.average ?? '—'],
        ['Highest', stats.highest ?? '—'],
        ['Lowest', stats.lowest ?? '—'],
        ['Pass Rate', `${stats.pass_rate ?? 0}%`],
      ],
    }))
  }

  return (
    <div className="space-y-5">
      <FiltersBar>
        <Field label="Exam">
          <select value={examId} onChange={(e) => setExamId(e.target.value)} className={selectCls}>
            <option value="">Select exam…</option>
            {exams.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
          </select>
        </Field>
        <Field label="Subject">
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={selectCls}>
            <option value="">Select subject…</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
          </select>
        </Field>
        {!isClassTeacher && (
          <>
            <Field label="Level">
              <select value={level} onChange={(e) => setLevel(e.target.value)} className={selectCls}>
                <option value="">Select level…</option>
                {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Stream (optional)">
              <input value={stream} onChange={(e) => setStream(e.target.value)} className={inputCls} placeholder="e.g. A" />
            </Field>
          </>
        )}
        {data && (
          <button
            onClick={handlePrint}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg
              text-sm font-medium hover:bg-secondary transition-colors"
          >
            <Printer size={14} />
            Print
          </button>
        )}
      </FiltersBar>

      {isSubjectTeacher && subjects.length === 0 && subjectsData !== undefined && (
        <p className="text-xs text-amber-600 -mt-2">
          No subjects are assigned to your staff profile yet — ask an academic teacher to assign them.
        </p>
      )}

      {!canQuery ? (
        <EmptyHint text="Select an exam and subject to view performance." />
      ) : isLoading ? (
        <ReportSkeleton />
      ) : isError ? (
        <ErrorHint text={error?.response?.data?.detail ?? 'Failed to load subject performance.'} />
      ) : !data?.students?.length ? (
        <EmptyHint text="No marks entered for this subject in this exam yet." />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard label="Students" value={data.stats.count} />
            <StatCard label="Average" value={data.stats.average ?? '—'} />
            <StatCard label="Highest" value={data.stats.highest ?? '—'} />
            <StatCard label="Lowest" value={data.stats.lowest ?? '—'} />
            <StatCard label="Pass Rate" value={`${data.stats.pass_rate}%`} highlight />
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-left">Pos</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-left">Student</th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-center">Score</th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-center">Grade</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-left">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.students.map((s) => (
                    <tr key={s.student_id} className="hover:bg-gray-50/40">
                      <td className="px-4 py-2.5 font-bold text-gray-700">{s.position}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900">{s.full_name}</div>
                        <div className="text-xs text-gray-400 font-mono">{s.student_id}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono font-semibold text-gray-800">{parseFloat(s.score).toFixed(0)}</td>
                      <td className="px-3 py-2.5 text-center"><Badge label={s.grade} colorClass={GRADE_BADGE[s.grade]} /></td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{s.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Small shared bits ──────────────────────────────────────────────────────────

function StatCard({ label, value, highlight }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-center ${highlight ? 'bg-primary/5 border-primary/20' : 'bg-white border-gray-100 shadow-sm'}`}>
      <div className={`text-lg font-bold ${highlight ? 'text-primary' : 'text-gray-900'}`}>{value}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">{label}</div>
    </div>
  )
}

function EmptyHint({ text }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-14 text-center">
      <Trophy size={36} className="mx-auto text-gray-200 mb-3" />
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  )
}

function ErrorHint({ text }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
      <p className="text-sm text-danger">{text}</p>
    </div>
  )
}

function ReportSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
      {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full rounded" />)}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

const TAB_META = {
  class:   { label: 'Class Performance',   icon: Users },
  subject: { label: 'Subject Performance', icon: FileBarChart2 },
}

export default function ReportsPage() {
  const { user } = useAuth()
  const role = user?.role
  const { levelOptions } = useSchoolLevels()

  const canClass = ['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER', 'CLASS_TEACHER'].includes(role)
  const canSubject = ['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER'].includes(role)
  const availableTabs = [canClass && 'class', canSubject && 'subject'].filter(Boolean)

  const [selectedTab, setSelectedTab] = useState(null)
  const tab = availableTabs.includes(selectedTab) ? selectedTab : availableTabs[0]

  const { data: examsData, isLoading: examsLoading } = useQuery({
    queryKey: ['exams', 'for-reports'],
    queryFn: () => getExams({ all: 'true' }),
  })
  const exams = examsData?.results ?? examsData ?? []

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <FileBarChart2 size={20} className="text-primary" />
          Examination Reports
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Class and subject performance across exams.
        </p>
      </div>

      {availableTabs.length > 1 && (
        <div className="flex gap-2 border-b border-gray-100">
          {availableTabs.map((t) => {
            const Icon = TAB_META[t].icon
            return (
              <button
                key={t}
                onClick={() => setSelectedTab(t)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
                  ${tab === t ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                <Icon size={14} />
                {TAB_META[t].label}
              </button>
            )
          })}
        </div>
      )}

      {examsLoading ? (
        <ReportSkeleton />
      ) : tab === 'class' && canClass ? (
        <ClassPerformanceReport role={role} exams={exams} levelOptions={levelOptions} />
      ) : tab === 'subject' && canSubject ? (
        <SubjectPerformanceReport role={role} exams={exams} levelOptions={levelOptions} />
      ) : (
        <EmptyHint text="You do not have access to any report type." />
      )}

    </div>
  )
}
