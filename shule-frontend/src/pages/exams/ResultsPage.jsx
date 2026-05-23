import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { ChevronLeft, Download, Loader2, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getExam, getRanking, getReportCard, getResults } from '../../api/exams'
import Skeleton from '../../components/ui/Skeleton'
import { GRADE_BADGE, LEVEL_LABEL } from '../../lib/constants'
import Badge from '../../components/ui/Badge'
import ReportCardView from '../../components/exams/ReportCardView'

// ── Medal styling for top 3 ────────────────────────────────────────────────

const MEDAL_ROW = {
  1: 'bg-yellow-50  border-yellow-200',
  2: 'bg-gray-50/80 border-gray-200',
  3: 'bg-orange-50  border-orange-200',
}

const MEDAL_ICON = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function grade(score) {
  const s = parseFloat(score)
  if (isNaN(s)) return ''
  if (s >= 75) return 'A'
  if (s >= 60) return 'B'
  if (s >= 45) return 'C'
  if (s >= 30) return 'D'
  return 'F'
}

function overallGrade(avg) {
  return grade(avg)
}

// ── Report Card Modal ──────────────────────────────────────────────────────

function ReportCardModal({ studentPk, examId, onClose }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-card', studentPk, examId],
    queryFn:  () => getReportCard(studentPk, examId),
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-6 w-full rounded" />)}
          </div>
        ) : isError || !data ? (
          <div className="p-12 text-center">
            <p className="text-sm text-danger">Report card not available for this student.</p>
            <button onClick={onClose} className="mt-4 text-sm text-primary hover:underline">Close</button>
          </div>
        ) : (
          <ReportCardView reportCard={data} onClose={onClose} />
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const [viewingCard, setViewingCard]   = useState(null)  // { studentPk }
  const [downloading, setDownloading]   = useState(false)

  const { data: exam }    = useQuery({ queryKey: ['exam', id],          queryFn: () => getExam(id) })
  const { data: rawRanking, isLoading: rankLoading, isError: rankError } = useQuery({
    queryKey: ['ranking', id],
    queryFn:  () => getRanking(id),
  })
  const { data: rawResults, isLoading: resLoading } = useQuery({
    queryKey: ['results', id],
    queryFn:  () => getResults(id),
  })

  const ranking = rawRanking ?? []
  const results = rawResults ?? []

  // Derive subjects from mark entries
  const subjects = useMemo(() => {
    const seen = new Map()
    results.forEach((r) => {
      if (!seen.has(r.subject)) {
        seen.set(r.subject, { id: r.subject, name: r.subject_name, code: r.subject_code })
      }
    })
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [results])

  // Build lookup: student_id_display → marks per subject
  const studentMarks = useMemo(() => {
    const map = {}
    results.forEach((r) => {
      if (!map[r.student_id_display]) map[r.student_id_display] = {}
      map[r.student_id_display][r.subject] = { score: r.score, grade: r.grade }
    })
    return map
  }, [results])

  // Subject pass-rate analysis (pass = grade C+, score >= 45)
  const subjectStats = useMemo(() => {
    return subjects.map((sub) => {
      const entries = results.filter((r) => r.subject === sub.id)
      const passed  = entries.filter((r) => parseFloat(r.score) >= 45).length
      return {
        name: sub.code,
        fullName: sub.name,
        passRate: entries.length ? Math.round((passed / entries.length) * 100) : 0,
        count: entries.length,
      }
    })
  }, [subjects, results])

  // ── Bulk download ──────────────────────────────────────────────────────

  async function downloadAllReportCards() {
    setDownloading(true)
    try {
      const cards = await Promise.all(
        ranking.map((row) =>
          getReportCard(row.student_pk, id).catch(() => null)
        )
      )
      const valid = cards.filter(Boolean)
      if (valid.length === 0) { toast.error('No report cards available.'); return }

      const html = valid.map((rc) => buildReportCardHtml(rc)).join(
        '<div style="page-break-after:always;height:24px;"></div>'
      )

      const w = window.open('', '_blank', 'width=800,height=900')
      w.document.write(`<!DOCTYPE html><html><head>
        <meta charset="utf-8">
        <title>Report Cards — ${exam?.name ?? ''}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, sans-serif; padding: 24px; background: #f5f5f5; }
          .card { background: white; max-width: 720px; margin: 0 auto 32px; padding: 32px;
            border: 1px solid #ddd; border-radius: 8px; }
          @media print { body { background: white; padding: 0; }
            .card { border: none; page-break-after: always; margin: 0; } }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
          th, td { padding: 7px 10px; border: 1px solid #e0e0e0; text-align: left; }
          th { background: #f8f8f8; font-weight: 600; }
          .header { text-align: center; border-bottom: 2px solid #1B4F72; padding-bottom: 14px; margin-bottom: 20px; }
          .school { font-size: 20px; font-weight: 800; color: #1B4F72; }
          .summary-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin: 16px 0; }
          .summary-box { background: #f8f8f8; border-radius: 6px; padding: 10px; text-align: center; }
          .summary-box .val { font-size: 18px; font-weight: 700; }
          .summary-box .lbl { font-size: 11px; color: #666; margin-top: 2px; }
          .sigs { display: flex; justify-content: space-between; margin-top: 40px; font-size: 12px; }
          .sig-line { width: 44%; border-top: 1px solid #aaa; padding-top: 6px; text-align: center; }
        </style>
      </head><body>${html}</body></html>`)
      w.document.close()
      w.focus()
      setTimeout(() => { w.print() }, 600)
    } catch {
      toast.error('Download failed.')
    } finally {
      setDownloading(false)
    }
  }

  if (rankLoading || resLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-9 w-full rounded" />)}
        </div>
      </div>
    )
  }

  if (rankError) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
        <p className="text-sm text-danger">Failed to load results.</p>
      </div>
    )
  }

  if (ranking.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/exams')} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <h1 className="text-xl font-bold text-gray-900">{exam?.name ?? 'Results'}</h1>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-14 text-center">
          <Trophy size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">No marks have been entered for this exam yet.</p>
          <button onClick={() => navigate(`/exams/${id}/marks`)} className="mt-4 text-sm text-primary hover:underline">
            Enter Marks
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate('/exams')} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors shrink-0 mt-0.5">
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{exam?.name ?? 'Results'}</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {exam && (LEVEL_LABEL[exam.level] ?? exam.level)}
              {exam?.stream ? ` · Stream ${exam.stream}` : ''}
              {exam?.term ? ` · ${exam.term.replace('TERM', 'Term ')}` : ''}
              {' · '}{ranking.length} students
            </p>
          </div>
        </div>
        <button
          onClick={downloadAllReportCards}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg
            text-sm font-medium hover:bg-secondary disabled:opacity-60 transition-colors"
        >
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {downloading ? 'Preparing…' : 'Download Report Cards'}
        </button>
      </div>

      {/* Ranking table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60 sticky top-0">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-left whitespace-nowrap">Pos</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-left">Student</th>
                {subjects.map((sub) => (
                  <th key={sub.id} className="px-3 py-3 text-xs font-medium text-gray-500 text-center whitespace-nowrap">
                    {sub.code}
                  </th>
                ))}
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-center whitespace-nowrap">Total</th>
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-center whitespace-nowrap">Avg</th>
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide text-center">Grade</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ranking.map((row) => {
                const marks  = studentMarks[row.student_id] ?? {}
                const avg    = parseFloat(row.average_score)
                const g      = overallGrade(avg)
                const medal  = MEDAL_ROW[row.position]

                return (
                  <tr
                    key={row.student_id}
                    className={`transition-colors ${medal ? `border-l-4 ${medal}` : 'hover:bg-gray-50/40'}`}
                  >
                    <td className="px-4 py-2.5 font-bold text-gray-700 whitespace-nowrap">
                      {MEDAL_ICON[row.position] ?? row.position}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900 text-sm">{row.student_name}</div>
                      <div className="text-xs text-gray-400 font-mono">{row.student_id}</div>
                    </td>
                    {subjects.map((sub) => {
                      const m = marks[sub.id]
                      return (
                        <td key={sub.id} className="px-3 py-2.5 text-center whitespace-nowrap">
                          {m ? (
                            <div>
                              <div className="font-mono text-xs text-gray-700">{parseFloat(m.score).toFixed(0)}</div>
                              <Badge label={m.grade} colorClass={GRADE_BADGE[m.grade]} />
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2.5 text-center font-mono font-semibold text-gray-800 whitespace-nowrap">
                      {parseFloat(row.total_score).toFixed(0)}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-gray-700 whitespace-nowrap">
                      {avg.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {g && <Badge label={g} colorClass={GRADE_BADGE[g]} />}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => setViewingCard({ studentPk: row.student_pk })}
                        className="text-xs text-primary hover:underline whitespace-nowrap"
                      >
                        Report card
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subject pass rate chart */}
      {subjectStats.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Subject Pass Rate (%)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={subjectStats} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v, _, { payload }) =>
                  [`${v}% (${payload.count} students)`, payload.fullName]
                }
              />
              <Bar dataKey="passRate" radius={[4, 4, 0, 0]} maxBarSize={64}>
                {subjectStats.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.passRate >= 80 ? '#27AE60' :
                      entry.passRate >= 60 ? '#F39C12' :
                      entry.passRate >= 40 ? '#2E86C1' :
                      '#E74C3C'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Pass threshold: grade C (score ≥ 45)
          </p>
        </div>
      )}

      {/* Per-subject individual report card modal */}
      {viewingCard && (
        <ReportCardModal
          studentPk={viewingCard.studentPk}
          examId={id}
          onClose={() => setViewingCard(null)}
        />
      )}
    </div>
  )
}

// ── Bulk print HTML builder ────────────────────────────────────────────────

function buildReportCardHtml(rc) {
  const rows = (rc.subjects ?? [])
    .map(
      (s) =>
        `<tr><td>${s.subject_name}</td><td>${s.subject_code}</td>
         <td style="text-align:center">${parseFloat(s.score).toFixed(0)}</td>
         <td style="text-align:center;font-weight:700">${s.grade}</td>
         <td>${s.remarks || '—'}</td></tr>`
    )
    .join('')

  const summ = rc.summary ?? {}
  const divLine = summ.division != null
    ? `Division ${summ.division}`
    : summ.aggregate != null
    ? `Aggregate ${summ.aggregate}`
    : ''

  return `<div class="card">
  <div class="header">
    <div class="school">Shule School</div>
    <div style="font-size:13px;color:#666;margin-top:3px">P.O. Box 1234, Dar es Salaam, Tanzania</div>
    <div style="margin-top:10px;font-size:15px;font-weight:700;color:#333">${rc.exam?.name ?? ''}</div>
    <div style="font-size:12px;color:#888;margin-top:2px">
      ${rc.exam?.term?.replace('TERM', 'Term ') ?? ''} · ${rc.exam?.academic_year ?? ''}
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px">
    ${[
      ['Student Name', rc.student?.full_name ?? ''],
      ['Student ID', rc.student?.student_id ?? ''],
      ['Level', rc.student?.level ?? ''],
      ['Stream', rc.student?.stream ?? '—'],
      ['Gender', rc.student?.gender === 'M' ? 'Male' : rc.student?.gender === 'F' ? 'Female' : '—'],
    ].map(([k, v]) =>
      `<tr><td style="width:40%;font-weight:600;padding:4px 8px;border:1px solid #eee;background:#fafafa">${k}</td>
       <td style="padding:4px 8px;border:1px solid #eee">${v}</td></tr>`
    ).join('')}
  </table>
  <table>
    <thead><tr><th>Subject</th><th>Code</th><th style="text-align:center">Score</th><th style="text-align:center">Grade</th><th>Remarks</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="summary-grid">
    <div class="summary-box"><div class="val">${summ.position ?? '—'} / ${summ.class_size ?? '—'}</div><div class="lbl">Position</div></div>
    <div class="summary-box"><div class="val">${parseFloat(summ.total_score ?? 0).toFixed(0)}</div><div class="lbl">Total</div></div>
    <div class="summary-box"><div class="val">${parseFloat(summ.average_score ?? 0).toFixed(1)}</div><div class="lbl">Average</div></div>
    <div class="summary-box"><div class="val">${divLine || '—'}</div><div class="lbl">Division/Agg</div></div>
  </div>
  <div class="sigs">
    <div class="sig-line">Class Teacher: ${rc.class_teacher ?? '________________________'}</div>
    <div class="sig-line">Head Teacher: ${rc.headteacher ?? '________________________'}</div>
  </div>
</div>`
}
