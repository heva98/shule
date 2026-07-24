import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronLeft,
  Clock,
  Loader2,
  Save,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { bulkEnterMarks, getExam, getResults, getSubjects } from '../../api/exams'
import { getStudents } from '../../api/students'
import Skeleton from '../../components/ui/Skeleton'
import { LEVEL_LABEL } from '../../lib/constants'

// ── Grade logic (mirrors Tanzania grading in backend) ──────────────────────

function grade(score) {
  const s = parseFloat(score)
  if (isNaN(s) || score === '' || score == null) return ''
  if (s >= 75) return 'A'
  if (s >= 60) return 'B'
  if (s >= 45) return 'C'
  if (s >= 30) return 'D'
  return 'F'
}

const GRADE_STYLE = {
  A: { text: 'text-green-600',  cell: 'bg-green-50/60' },
  B: { text: 'text-blue-600',   cell: 'bg-blue-50/60' },
  C: { text: 'text-yellow-600', cell: 'bg-yellow-50/60' },
  D: { text: 'text-orange-500', cell: 'bg-orange-50/60' },
  F: { text: 'text-red-600',    cell: 'bg-red-50/60' },
}

function getLevelGroup(level) {
  if (!level) return null
  if (['STD1','STD2','STD3','STD4','STD5','STD6','STD7'].includes(level)) return 'PRIMARY'
  if (['FORM1','FORM2','FORM3','FORM4'].includes(level)) return 'OLEVEL'
  return 'ALEVEL'
}

const DRAFT_KEY = (id) => `exam-draft-${id}`

// ── Mark entry grid ────────────────────────────────────────────────────────

export default function MarkEntryPage() {
  const { id }    = useParams()
  const navigate  = useNavigate()

  // ── Remote data ──────────────────────────────────────────────────────────

  const { data: exam, isLoading: examLoading } = useQuery({
    queryKey: ['exam', id],
    queryFn:  () => getExam(id),
  })

  const levelGroup = getLevelGroup(exam?.level)

  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ['exam-students', exam?.level, exam?.stream],
    queryFn: () => {
      const params = { level: exam.level, status: 'ACTIVE', all: 'true' }
      if (exam.stream) params.stream = exam.stream
      return getStudents(params)
    },
    enabled: !!exam?.level,
  })

  const { data: subjectsData, isLoading: subjectsLoading } = useQuery({
    queryKey: ['subjects-all'],
    queryFn:  () => getSubjects({ all: 'true' }),
  })

  const { data: existingMarks, isLoading: marksLoading } = useQuery({
    queryKey: ['exam-results', id],
    queryFn:  () => getResults(id),
  })

  const students = useMemo(() => Array.isArray(studentsData) ? studentsData : studentsData?.results ?? [], [studentsData])
  const subjects = useMemo(() => {
    const all = Array.isArray(subjectsData) ? subjectsData : subjectsData?.results ?? []
    return levelGroup ? all.filter((s) => s.level_group === levelGroup) : all
  }, [subjectsData, levelGroup])

  // ── Grid state ────────────────────────────────────────────────────────────
  // grid[studentId][subjectId] = score string

  const [grid,     setGrid]     = useState({})
  const [hasDraft, setHasDraft] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [lastSaved,  setLastSaved]  = useState(null)

  const dataReady = !examLoading && !studentsLoading && !subjectsLoading && !marksLoading
    && students.length > 0 && subjects.length > 0

  // Initialize grid from server data (skip if draft pending).
  // Deliberate exception: this can only run once the exam/student/subject/mark
  // queries resolve — there's no render-time equivalent since none of these
  // values are known until this effect runs.
  useEffect(() => {
    if (!dataReady) return
    const draft = localStorage.getItem(DRAFT_KEY(id))
    if (draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasDraft(true)
      return
    }
    const init = {}
    students.forEach((s) => {
      init[s.id] = {}
      subjects.forEach((sub) => { init[s.id][sub.id] = '' })
    })
    ;(existingMarks ?? []).forEach((m) => {
      if (init[m.student]) init[m.student][m.subject] = String(m.score)
    })
    setGrid(init)
  }, [dataReady, id])  // intentionally omit deep deps — runs once when ready

  function restoreDraft() {
    try {
      const saved = localStorage.getItem(DRAFT_KEY(id))
      if (saved) { setGrid(JSON.parse(saved)); setHasDraft(false) }
    } catch {
      toast.error('Draft restore failed.')
    }
  }

  function dismissDraft() {
    localStorage.removeItem(DRAFT_KEY(id))
    setHasDraft(false)
    // Re-init from server
    const init = {}
    students.forEach((s) => {
      init[s.id] = {}
      subjects.forEach((sub) => { init[s.id][sub.id] = '' })
    })
    ;(existingMarks ?? []).forEach((m) => {
      if (init[m.student]) init[m.student][m.subject] = String(m.score)
    })
    setGrid(init)
  }

  // Auto-save draft every 30 s
  useEffect(() => {
    if (!dataReady || hasDraft) return
    const t = setInterval(() => {
      localStorage.setItem(DRAFT_KEY(id), JSON.stringify(grid))
      setLastSaved(new Date())
    }, 30000)
    return () => clearInterval(t)
  }, [id, grid, dataReady, hasDraft])

  // ── Cell handlers ─────────────────────────────────────────────────────────

  const handleChange = useCallback((sid, subid, value) => {
    if (value !== '' && !/^(\d{0,3})(\.\d{0,2})?$/.test(value)) return
    setGrid((g) => ({
      ...g,
      [sid]: { ...g[sid], [subid]: value },
    }))
  }, [])

  function handleKeyDown(e, si, sj) {
    if (e.key !== 'Tab') return
    e.preventDefault()
    let nsi = si, nsj = sj + 1
    if (nsj >= subjects.length) { nsj = 0; nsi = si + 1 }
    if (nsi < students.length) {
      document.getElementById(`cell-${nsi}-${nsj}`)?.focus()
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    const records = []
    students.forEach((s) => {
      subjects.forEach((sub) => {
        const raw = grid[s.id]?.[sub.id]
        const num = parseFloat(raw)
        if (raw !== '' && raw != null && !isNaN(num)) {
          records.push({ student_id: s.student_id, subject_id: sub.id, score: num, remarks: '' })
        }
      })
    })
    if (records.length === 0) { toast.error('No marks to save.'); return }

    setSubmitting(true)
    try {
      const result = await bulkEnterMarks(id, { records })
      toast.success(result.detail ?? `${result.created + result.updated} marks saved.`)
      localStorage.removeItem(DRAFT_KEY(id))
      setLastSaved(new Date())
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.response?.data?.records?.[0] ?? 'Save failed.'
      toast.error(typeof msg === 'string' ? msg : 'Save failed.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Summary counts ────────────────────────────────────────────────────────

  const filled = useMemo(() => {
    let n = 0
    Object.values(grid).forEach((row) =>
      Object.values(row).forEach((v) => { if (v !== '') n++ })
    )
    return n
  }, [grid])

  const total = students.length * subjects.length

  // ── Loading / empty states ────────────────────────────────────────────────

  if (examLoading || studentsLoading || subjectsLoading || marksLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full rounded" />)}
        </div>
      </div>
    )
  }

  if (!exam) {
    return <p className="text-sm text-danger">Exam not found.</p>
  }

  if (students.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
        <p className="text-sm text-gray-400">
          No active students found for {LEVEL_LABEL[exam.level] ?? exam.level}
          {exam.stream ? ` · Stream ${exam.stream}` : ''}.
        </p>
      </div>
    )
  }

  if (subjects.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
        <p className="text-sm text-gray-400">
          No subjects configured for this level group ({levelGroup ?? 'unknown'}).
          Add subjects in the admin panel first.
        </p>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate('/exams')}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors shrink-0 mt-0.5"
        >
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{exam.name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {LEVEL_LABEL[exam.level] ?? exam.level}
            {exam.stream ? ` · Stream ${exam.stream}` : ''} ·{' '}
            {exam.term?.replace('TERM', 'Term ')} · {exam.exam_type}
          </p>
        </div>
      </div>

      {/* Draft restore banner */}
      {hasDraft && (
        <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-yellow-600 shrink-0" />
          <span className="text-yellow-800 flex-1">
            Unsaved draft found. Restore it to continue where you left off.
          </span>
          <button
            onClick={restoreDraft}
            className="px-3 py-1 bg-yellow-600 text-white rounded-lg text-xs font-medium hover:bg-yellow-700 transition-colors"
          >
            Restore
          </button>
          <button
            onClick={dismissDraft}
            className="px-3 py-1 border border-yellow-300 text-yellow-700 rounded-lg text-xs hover:bg-yellow-100 transition-colors"
          >
            Discard
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-280px)]">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="sticky top-0 z-20">
                {/* # col */}
                <th className="sticky left-0 z-30 bg-gray-50 border-b border-r border-gray-200
                  px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap min-w-[2.5rem]">
                  #
                </th>
                {/* Name col */}
                <th className="sticky left-10 z-30 bg-gray-50 border-b border-r border-gray-200
                  px-4 py-2.5 text-xs font-medium text-gray-500 text-left whitespace-nowrap min-w-[160px]">
                  Student
                </th>
                {/* Subject cols */}
                {subjects.map((sub) => (
                  <th
                    key={sub.id}
                    className="bg-gray-50 border-b border-r border-gray-200 px-2 py-2.5
                      text-xs font-medium text-gray-600 text-center whitespace-nowrap min-w-[80px]"
                  >
                    <div className="font-semibold">{sub.code}</div>
                    <div className="font-normal text-gray-400 text-[10px] truncate max-w-[70px]">
                      {sub.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {students.map((s, si) => (
                <tr key={s.id} className="hover:bg-gray-50/40 transition-colors">
                  {/* # */}
                  <td className="sticky left-0 z-10 bg-white border-r border-gray-100
                    px-3 py-1.5 text-xs text-gray-400 tabular-nums text-center">
                    {si + 1}
                  </td>
                  {/* Name */}
                  <td className="sticky left-10 z-10 bg-white border-r border-gray-100
                    px-4 py-1.5 whitespace-nowrap">
                    <div className="font-medium text-gray-900 text-xs">{s.full_name}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{s.student_id}</div>
                  </td>
                  {/* Score cells */}
                  {subjects.map((sub, sj) => {
                    const val = grid[s.id]?.[sub.id] ?? ''
                    const g   = grade(val)
                    const sty = GRADE_STYLE[g]
                    return (
                      <td
                        key={sub.id}
                        className={`border-r border-gray-100 px-1.5 py-1.5 text-center
                          ${g ? sty.cell : ''}`}
                      >
                        <input
                          id={`cell-${si}-${sj}`}
                          type="text"
                          inputMode="decimal"
                          value={val}
                          onChange={(e) => handleChange(s.id, sub.id, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, si, sj)}
                          className="w-14 text-center border border-gray-200 rounded-md px-1 py-0.5
                            text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40
                            focus:border-primary bg-white"
                          placeholder="—"
                        />
                        {g && (
                          <div className={`text-[10px] font-bold mt-0.5 ${sty.text}`}>{g}</div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100
        shadow-sm px-5 py-3">
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>
            <span className="font-semibold text-gray-800">{filled}</span>
            {' / '}
            <span>{total}</span>
            {' cells filled'}
          </span>
          {lastSaved && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock size={11} />
              Saved {lastSaved.toLocaleTimeString('en-TZ', { timeStyle: 'short' })}
            </span>
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting || filled === 0}
          className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg
            text-sm font-medium hover:bg-secondary disabled:opacity-50 transition-colors"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {submitting ? 'Saving…' : 'Save All Marks'}
        </button>
      </div>
    </div>
  )
}
