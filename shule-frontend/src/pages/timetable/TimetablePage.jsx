import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Coffee, Download, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  createPeriod,
  createTimetableEntry,
  deletePeriod,
  deleteTimetableEntry,
  getPeriods,
  getTimetableEntries,
  updatePeriod,
  updateTimetableEntry,
} from '../../api/timetable'
import { getAcademicYears } from '../../api/fees'
import { getSubjects } from '../../api/exams'
import { getStaff } from '../../api/staff'
import { useAuth } from '../../context/AuthContext'
import { useSchoolLevels } from '../../hooks/useSchoolLevels'
import { LEVEL_LABEL, SENIOR_STAFF_ROLES } from '../../lib/constants'
import Modal from '../../components/ui/Modal'
import Tabs from '../../components/ui/Tabs'

const EDIT_ROLES = SENIOR_STAFF_ROLES
const MINE_DEFAULT_ROLES = ['TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'DISCIPLINE_TEACHER']

const DAYS = [
  { value: 'MON', label: 'Mon' },
  { value: 'TUE', label: 'Tue' },
  { value: 'WED', label: 'Wed' },
  { value: 'THU', label: 'Thu' },
  { value: 'FRI', label: 'Fri' },
  { value: 'SAT', label: 'Sat' },
]

const selectCls = `border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-700
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

// ── Printable HTML (opens a print window — same "download as PDF" pattern used
// by report cards / receipts elsewhere in the app: user saves via the browser's
// print-to-PDF destination) ────────────────────────────────────────────────────

function buildTimetablePrintHtml({ heading, subheading, periods, grid, mineKeys, onlyMine }) {
  const rows = periods.map((p) => {
    const timeLabel = `${p.start_time?.slice(0, 5)}–${p.end_time?.slice(0, 5)}`
    if (p.is_break) {
      return `<tr><td class="ptime"><strong>${p.name}</strong><br><span class="time">${timeLabel}</span></td>
        <td colspan="${DAYS.length}" class="break">Break</td></tr>`
    }
    const cells = DAYS.map((d) => {
      const key = `${d.value}-${p.id}`
      const e = grid[key]
      if (!e) return '<td></td>'
      if (onlyMine && !mineKeys.has(key)) return '<td class="occupied"></td>'
      const line1 = e.subject_code ?? 'Free'
      const line2 = e.teacher_name ?? '—'
      return `<td class="${mineKeys.has(key) ? 'mine' : ''}"><div class="l1">${line1}</div><div class="l2">${line2}</div>${e.room ? `<div class="l3">${e.room}</div>` : ''}</td>`
    }).join('')
    return `<tr><td class="ptime"><strong>${p.name}</strong><br><span class="time">${timeLabel}</span></td>${cells}</tr>`
  }).join('')

  const dayHeaders = DAYS.map((d) => `<th>${d.label}</th>`).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Timetable — ${heading}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #111; padding: 28px; }
  .header { text-align: center; border-bottom: 2px solid #1B4F72; padding-bottom: 12px; margin-bottom: 16px; }
  .header h1 { font-size: 18px; color: #1B4F72; letter-spacing: 0.5px; }
  .header p { font-size: 12px; color: #555; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1B4F72; color: #fff; padding: 8px 6px; text-align: left; font-size: 11px; }
  td { padding: 6px; border: 1px solid #eee; vertical-align: top; font-size: 11px; }
  .ptime { width: 90px; background: #f9f9f9; }
  .ptime .time { color: #777; font-size: 10px; }
  .break { text-align: center; color: #999; background: #fafafa; }
  .l1 { font-weight: 600; }
  .l2 { color: #444; }
  .l3 { color: #888; font-size: 10px; }
  .mine { border-left: 3px solid #27AE60; }
  .occupied { background: #f2f2f2; }
  @media print { body { padding: 12px; } }
</style>
</head>
<body>
  <div class="header">
    <h1>SHULE MANAGEMENT SYSTEM</h1>
    <p>${heading}${subheading ? ` — ${subheading}` : ''}</p>
  </div>
  <table>
    <thead><tr><th>Period</th>${dayHeaders}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`
}

// ── Entry (assign lesson) modal ────────────────────────────────────────────────

function EntryModal({ context, entry, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!entry

  const { data: subjectData } = useQuery({ queryKey: ['tt-subjects'], queryFn: () => getSubjects({ all: 'true' }) })
  const subjects = Array.isArray(subjectData) ? subjectData : (subjectData?.results ?? [])

  const { data: staffData } = useQuery({ queryKey: ['tt-staff'], queryFn: () => getStaff({}) })
  const teachers = staffData?.results ?? []

  const { register, handleSubmit } = useForm({
    defaultValues: {
      subject: entry?.subject ?? '',
      teacher: entry?.teacher ?? '',
      room: entry?.room ?? '',
    },
  })

  const saveMut = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        subject: data.subject || null,
        teacher: data.teacher || null,
        ...context,
      }
      return isEdit ? updateTimetableEntry(entry.id, payload) : createTimetableEntry(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timetable-entries'] })
      toast.success(isEdit ? 'Lesson updated.' : 'Lesson assigned.')
      onClose()
    },
    onError: (err) => {
      const data = err.response?.data
      const msg = data?.teacher?.[0] ?? data?.detail ?? 'Failed to save.'
      toast.error(msg)
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteTimetableEntry(entry.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timetable-entries'] })
      toast.success('Lesson removed.')
      onClose()
    },
    onError: () => toast.error('Failed to remove.'),
  })

  return (
    <Modal isOpen title={isEdit ? 'Edit Lesson' : 'Assign Lesson'} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit((d) => saveMut.mutate(d))} className="p-6 space-y-4">
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          {LEVEL_LABEL[context.level] ?? context.level}{context.stream ? ` ${context.stream}` : ''} &middot;{' '}
          {DAYS.find((d) => d.value === context.day_of_week)?.label} &middot; {context.periodLabel}
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
          <select {...register('subject')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">— Free period —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Teacher</label>
          <select {...register('teacher')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">— Unassigned —</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Room</label>
          <input {...register('room')} placeholder="e.g. Room 4"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex gap-3">
          {isEdit && (
            <button type="button" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}
              className="px-3 py-2.5 border border-red-200 text-danger rounded-lg text-sm hover:bg-red-50 disabled:opacity-50">
              <Trash2 size={14} />
            </button>
          )}
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saveMut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Weekly grid ─────────────────────────────────────────────────────────────

function GridTab({ canEdit }) {
  const { user } = useAuth()
  const { levelOptions } = useSchoolLevels()
  const [viewMode, setViewMode] = useState(MINE_DEFAULT_ROLES.includes(user?.role) ? 'mine' : 'class')
  const [academicYear, setAcademicYear] = useState('')
  const [level, setLevel] = useState('')
  const [stream, setStream] = useState('')
  const [myClassKey, setMyClassKey] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [cell, setCell] = useState(null) // { context, entry } | null

  const { data: yearsData } = useQuery({ queryKey: ['tt-academic-years'], queryFn: getAcademicYears })
  const years = yearsData?.results ?? yearsData ?? []
  const currentYearId = years.find((y) => y.is_current)?.id ?? ''
  const effectiveYear = academicYear || currentYearId
  // Reflect the current year's own option as selected in the dropdown, rather
  // than leaving it on the generic "Current year" placeholder.
  const selectedYearValue = academicYear || String(currentYearId)

  const { data: periodsData } = useQuery({ queryKey: ['periods'], queryFn: getPeriods })
  const periods = periodsData?.results ?? periodsData ?? []

  // The viewer's own sessions across every class — used to (a) list which classes
  // they're assigned to for "My Timetable" mode, and (b) know which cells in
  // whichever class is on screen are actually theirs, for the "only my sessions" filter.
  const myEntriesQ = useQuery({
    queryKey: ['tt-my-entries', effectiveYear],
    queryFn: () => getTimetableEntries({ mine: 'true', academic_year: effectiveYear || undefined }),
    enabled: !!effectiveYear,
  })
  const myEntries = myEntriesQ.data?.results ?? myEntriesQ.data ?? []

  const myClasses = useMemo(() => {
    const map = new Map()
    myEntries.forEach((e) => {
      const key = `${e.level}|${e.stream ?? ''}`
      if (!map.has(key)) map.set(key, { level: e.level, stream: e.stream ?? '' })
    })
    return [...map.values()]
  }, [myEntries])

  const resolvedMyClassKey = myClassKey || (myClasses[0] ? `${myClasses[0].level}|${myClasses[0].stream}` : '')
  const [viewLevel, viewStream] = viewMode === 'mine'
    ? (resolvedMyClassKey ? resolvedMyClassKey.split('|') : ['', ''])
    : [level, stream]

  const entriesQ = useQuery({
    queryKey: ['timetable-entries', viewLevel, viewStream, effectiveYear],
    queryFn: () => getTimetableEntries({
      academic_year: effectiveYear || undefined, level: viewLevel || undefined, stream: viewStream || undefined,
    }),
    enabled: !!viewLevel && !!effectiveYear,
  })
  const entries = entriesQ.data?.results ?? entriesQ.data ?? []

  const grid = useMemo(() => {
    const map = {}
    entries.forEach((e) => {
      map[`${e.day_of_week}-${e.period}`] = e
    })
    return map
  }, [entries])

  const mineKeys = useMemo(() => {
    const set = new Set()
    myEntries.forEach((e) => {
      if (e.level === viewLevel && (e.stream ?? '') === (viewStream ?? '')) {
        set.add(`${e.day_of_week}-${e.period}`)
      }
    })
    return set
  }, [myEntries, viewLevel, viewStream])

  const currentYearLabel = years.find((y) => String(y.id) === String(effectiveYear))?.year ?? ''

  function handleDownloadPdf() {
    const w = window.open('', '_blank', 'width=1000,height=800')
    if (!w) return
    const heading = viewLevel
      ? `${LEVEL_LABEL[viewLevel] ?? viewLevel}${viewStream ? ` ${viewStream}` : ''}`
      : 'Timetable'
    const subheadingParts = []
    if (currentYearLabel) subheadingParts.push(`Academic Year ${currentYearLabel}`)
    if (onlyMine) subheadingParts.push('My sessions only')
    w.document.write(buildTimetablePrintHtml({
      heading,
      subheading: subheadingParts.join(' · '),
      periods,
      grid,
      mineKeys,
      onlyMine,
    }))
    w.document.close()
    setTimeout(() => { w.print(); w.close() }, 400)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            type="button"
            onClick={() => setViewMode('mine')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'mine' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            My Timetable
          </button>
          <button
            type="button"
            onClick={() => setViewMode('class')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'class' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            By Class
          </button>
        </div>

        <select value={selectedYearValue} onChange={(e) => setAcademicYear(e.target.value)} className={selectCls}>
          <option value="">Current year</option>
          {years.map((y) => <option key={y.id} value={y.id}>{y.year}</option>)}
        </select>

        {viewMode === 'class' ? (
          <>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className={selectCls}>
              <option value="">Select level…</option>
              {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input value={stream} onChange={(e) => setStream(e.target.value)} placeholder="Stream (optional)"
              className={`${selectCls} sm:w-40`} />
          </>
        ) : myClasses.length > 1 ? (
          <select value={resolvedMyClassKey} onChange={(e) => setMyClassKey(e.target.value)} className={selectCls}>
            {myClasses.map((c) => {
              const key = `${c.level}|${c.stream}`
              return (
                <option key={key} value={key}>
                  {LEVEL_LABEL[c.level] ?? c.level}{c.stream ? ` ${c.stream}` : ''}
                </option>
              )
            })}
          </select>
        ) : myClasses.length === 1 ? (
          <span className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg">
            {LEVEL_LABEL[myClasses[0].level] ?? myClasses[0].level}{myClasses[0].stream ? ` ${myClasses[0].stream}` : ''}
          </span>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-gray-600 select-none">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="rounded" />
          Only my sessions
        </label>

        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={!viewLevel || !effectiveYear || periods.length === 0}
          className="sm:ml-auto flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={14} /> Download PDF
        </button>
      </div>

      {!effectiveYear ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {years.length === 0
            ? 'No academic years have been set up yet. Go to Academic Year Setup to add one.'
            : 'No academic year is marked as current. Pick one from the dropdown above, or set one as current in Academic Year Setup.'}
        </div>
      ) : viewMode === 'mine' && myClasses.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          You're not currently assigned to any class sessions. Switch to "By Class" to browse the school's timetable.
        </div>
      ) : viewMode === 'class' && !level ? (
        <div className="text-center py-16 text-gray-400 text-sm">Select a level to view its timetable.</div>
      ) : periods.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No periods have been set up yet.{canEdit ? ' Use the "Manage Periods" tab to add some.' : ''}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-36">Period</th>
                {DAYS.map((d) => (
                  <th key={d.value} className="text-left px-3 py-3 text-xs font-medium text-gray-500">{d.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {periods.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-gray-800 text-xs">{p.name}</p>
                    <p className="text-[11px] text-gray-400">{p.start_time?.slice(0, 5)}–{p.end_time?.slice(0, 5)}</p>
                  </td>
                  {p.is_break ? (
                    <td colSpan={DAYS.length} className="px-3 py-3 bg-gray-50 text-center text-xs text-gray-400">
                      <span className="inline-flex items-center gap-1.5"><Coffee size={12} /> Break</span>
                    </td>
                  ) : (
                    DAYS.map((d) => {
                      const key = `${d.value}-${p.id}`
                      const existing = grid[key]
                      const isMine = mineKeys.has(key)
                      const hideForFilter = onlyMine && existing && !isMine
                      const editable = canEdit && viewMode === 'class'
                      const context = {
                        academic_year: effectiveYear, level: viewLevel, stream: viewStream,
                        day_of_week: d.value, period: p.id,
                        periodLabel: p.name,
                      }
                      return (
                        <td key={d.value} className="px-1.5 py-1.5 align-top">
                          <button
                            type="button"
                            disabled={!editable || hideForFilter}
                            onClick={() => editable && !hideForFilter && setCell({ context, entry: existing })}
                            className={`w-full min-h-[52px] rounded-lg px-2 py-1.5 text-left transition-colors border ${
                              hideForFilter
                                ? 'bg-gray-50 border-gray-100'
                                : existing
                                ? `bg-primary/5 hover:bg-primary/10 ${isMine ? 'border-success/40 border-l-4' : 'border-primary/20'}`
                                : 'border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            } ${!editable || hideForFilter ? 'cursor-default' : ''}`}
                          >
                            {hideForFilter ? null : existing ? (
                              <>
                                <p className="text-xs font-semibold text-gray-800 truncate">
                                  {existing.subject_code ?? 'Free'}
                                </p>
                                <p className="text-[11px] text-gray-500 truncate">{existing.teacher_name ?? '—'}</p>
                                {existing.room && (
                                  <p className="text-[10px] text-gray-400 truncate">{existing.room}</p>
                                )}
                              </>
                            ) : editable ? (
                              <Plus size={13} className="text-gray-300 mx-auto" />
                            ) : null}
                          </button>
                        </td>
                      )
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cell && (
        <EntryModal context={cell.context} entry={cell.entry} onClose={() => setCell(null)} />
      )}
    </div>
  )
}

// ── Manage periods ────────────────────────────────────────────────────────────

function PeriodModal({ period, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!period
  const { register, handleSubmit } = useForm({
    defaultValues: period
      ? { name: period.name, start_time: period.start_time?.slice(0, 5), end_time: period.end_time?.slice(0, 5), order: period.order, is_break: period.is_break }
      : { order: 1, is_break: false },
  })
  const mut = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, order: Number(data.order) }
      return isEdit ? updatePeriod(period.id, payload) : createPeriod(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods'] })
      toast.success(isEdit ? 'Period updated.' : 'Period added.')
      onClose()
    },
    onError: () => toast.error('Failed to save.'),
  })
  return (
    <Modal isOpen title={isEdit ? 'Edit Period' : 'Add Period'} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
          <input {...register('name', { required: true })} placeholder="e.g. Period 1"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Start time *</label>
            <input type="time" {...register('start_time', { required: true })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">End time *</label>
            <input type="time" {...register('end_time', { required: true })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Order *</label>
          <input type="number" min="1" {...register('order', { required: true })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" {...register('is_break')} className="rounded" />
          Break / lunch slot (no lessons)
        </label>
        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={mut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PeriodsTab() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editPeriod, setEditPeriod] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['periods'], queryFn: getPeriods })
  const periods = data?.results ?? data ?? []

  const deleteMut = useMutation({
    mutationFn: (id) => deletePeriod(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods'] })
      toast.success('Period removed.')
      setDeleteId(null)
    },
    onError: () => toast.error('Could not remove — it may still have lessons assigned.'),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
          <Plus size={14} /> Add Period
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Order</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Name</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Time</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Type</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded" /></td></tr>
              ))
            ) : periods.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">
                <Clock size={28} className="mx-auto text-gray-200 mb-2" />
                No periods defined yet.
              </td></tr>
            ) : periods.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 text-gray-500">{p.order}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                <td className="px-4 py-3 text-gray-600">{p.start_time?.slice(0, 5)}–{p.end_time?.slice(0, 5)}</td>
                <td className="px-4 py-3">
                  {p.is_break
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Break</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Lesson</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditPeriod(p)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                      <Clock size={13} />
                    </button>
                    <button onClick={() => setDeleteId(p.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-danger">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && <PeriodModal onClose={() => setShowAdd(false)} />}
      {editPeriod && <PeriodModal period={editPeriod} onClose={() => setEditPeriod(null)} />}
      {deleteId && (
        <Modal isOpen title="Remove Period" onClose={() => setDeleteId(null)} size="sm">
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600">Remove this period? Any lessons scheduled in it will fail to delete this until they're removed first.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => deleteMut.mutate(deleteId)} disabled={deleteMut.isPending}
                className="flex-1 py-2.5 bg-danger text-white rounded-lg text-sm font-medium hover:bg-danger/90 disabled:opacity-50">
                {deleteMut.isPending ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TimetablePage() {
  const { user } = useAuth()
  const canEdit = EDIT_ROLES.includes(user?.role)
  const [tab, setTab] = useState('grid')

  const tabs = [
    { id: 'grid', label: 'Weekly Timetable' },
    ...(canEdit ? [{ id: 'periods', label: 'Manage Periods' }] : []),
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Timetable</h1>
        <p className="text-sm text-gray-500 mt-0.5">Weekly class schedule by level and stream.</p>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'grid' && <GridTab canEdit={canEdit} />}
      {tab === 'periods' && canEdit && <PeriodsTab />}
    </div>
  )
}
