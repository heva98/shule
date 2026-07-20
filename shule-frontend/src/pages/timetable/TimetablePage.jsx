import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Coffee, Plus, Trash2 } from 'lucide-react'
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
import { LEVEL_LABEL } from '../../lib/constants'
import Modal from '../../components/ui/Modal'
import Tabs from '../../components/ui/Tabs'

const EDIT_ROLES = ['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER']

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
  const { levelOptions } = useSchoolLevels()
  const [academicYear, setAcademicYear] = useState('')
  const [level, setLevel] = useState('')
  const [stream, setStream] = useState('')
  const [cell, setCell] = useState(null) // { context, entry } | null

  const { data: yearsData } = useQuery({ queryKey: ['tt-academic-years'], queryFn: getAcademicYears })
  const years = yearsData?.results ?? yearsData ?? []
  const effectiveYear = academicYear || years.find((y) => y.is_current)?.id || ''

  const { data: periodsData } = useQuery({ queryKey: ['periods'], queryFn: getPeriods })
  const periods = periodsData?.results ?? periodsData ?? []

  const entriesQ = useQuery({
    queryKey: ['timetable-entries', effectiveYear, level, stream],
    queryFn: () => getTimetableEntries({
      academic_year: effectiveYear || undefined,
      level: level || undefined,
      stream: stream || undefined,
    }),
    enabled: !!level && !!effectiveYear,
  })
  const entries = entriesQ.data?.results ?? entriesQ.data ?? []

  const grid = useMemo(() => {
    const map = {}
    entries.forEach((e) => {
      map[`${e.day_of_week}-${e.period}`] = e
    })
    return map
  }, [entries])

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className={selectCls}>
          <option value="">Current year</option>
          {years.map((y) => <option key={y.id} value={y.id}>{y.year}</option>)}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className={selectCls}>
          <option value="">Select level…</option>
          {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input value={stream} onChange={(e) => setStream(e.target.value)} placeholder="Stream (optional)"
          className={`${selectCls} sm:w-40`} />
      </div>

      {!level ? (
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
                      const existing = grid[`${d.value}-${p.id}`]
                      const context = {
                        academic_year: effectiveYear, level, stream,
                        day_of_week: d.value, period: p.id,
                        periodLabel: p.name,
                      }
                      return (
                        <td key={d.value} className="px-1.5 py-1.5 align-top">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => setCell({ context, entry: existing })}
                            className={`w-full min-h-[52px] rounded-lg px-2 py-1.5 text-left transition-colors border ${
                              existing
                                ? 'bg-primary/5 border-primary/20 hover:bg-primary/10'
                                : 'border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            } ${!canEdit ? 'cursor-default' : ''}`}
                          >
                            {existing ? (
                              <>
                                <p className="text-xs font-semibold text-gray-800 truncate">
                                  {existing.subject_code ?? 'Free'}
                                </p>
                                <p className="text-[11px] text-gray-500 truncate">{existing.teacher_name ?? '—'}</p>
                              </>
                            ) : canEdit ? (
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
