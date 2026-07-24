import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BedDouble, Building2, Edit2, LogOut, Plus, Trash2, User, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  createBoardingAssignment,
  createDormitory,
  deleteBoardingAssignment,
  deleteDormitory,
  getBoardingAssignments,
  getDormitories,
  updateDormitory,
  vacateBoardingAssignment,
} from '../../api/boarding'
import { getAcademicYears } from '../../api/fees'
import { getStaff } from '../../api/staff'
import { getStudents } from '../../api/students'
import { useAuth } from '../../context/AuthContext'
import { useSchoolLevels } from '../../hooks/useSchoolLevels'
import { FEATURE_ROLES, LEVEL_LABEL } from '../../lib/constants'
import Modal from '../../components/ui/Modal'
import Tabs from '../../components/ui/Tabs'

const MANAGE_ROLES = FEATURE_ROLES.BOARDING

const GENDER_LABEL = { M: 'Boys', F: 'Girls' }

const selectCls = `border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-700
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Student picker — searchable dropdown over an already class+gender-scoped roster ──

function StudentPicker({ students, selected, onSelect, onClear, disabled, placeholder }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const filtered = query.trim().length > 0
    ? students.filter((s) => {
        const q = query.trim().toLowerCase()
        return s.full_name.toLowerCase().includes(q) || s.student_id.toLowerCase().includes(q)
      })
    : students

  useEffect(() => {
    function outside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  if (selected) {
    return (
      <div className="flex items-center gap-2 border-2 border-primary rounded-lg px-3 py-2 bg-primary/5">
        <User size={14} className="text-primary shrink-0" />
        <span className="text-sm flex-1 text-gray-800">
          {selected.full_name} <span className="text-xs text-gray-400 font-mono">{selected.student_id}</span>
        </span>
        <button type="button" onClick={onClear} className="p-0.5 text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:text-gray-400"
      />
      {open && !disabled && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">No matching students in this class.</p>
          ) : filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onSelect(s); setQuery(''); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm transition-colors flex items-center justify-between"
            >
              <span className="font-medium text-gray-900">{s.full_name}</span>
              <span className="text-xs text-gray-400 font-mono">{s.student_id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Dormitory modal ─────────────────────────────────────────────────────────────

function DormitoryModal({ dorm, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!dorm

  const { data: staffData } = useQuery({ queryKey: ['boarding-staff'], queryFn: () => getStaff({}) })
  const staff = staffData?.results ?? []

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: dorm
      ? { name: dorm.name, gender: dorm.gender, capacity: dorm.capacity, warden: dorm.warden ?? '', location: dorm.location, notes: dorm.notes }
      : { gender: 'M', capacity: 20 },
  })

  const saveMut = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, capacity: Number(data.capacity), warden: data.warden || null }
      return isEdit ? updateDormitory(dorm.id, payload) : createDormitory(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dormitories'] })
      toast.success(isEdit ? 'Dormitory updated.' : 'Dormitory added.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save.'),
  })

  return (
    <Modal isOpen title={isEdit ? 'Edit Dormitory' : 'Add Dormitory'} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit((d) => saveMut.mutate(d))} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
          <input {...register('name', { required: 'Required' })} placeholder="e.g. Amani House"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {errors.name && <p className="text-xs text-danger mt-1">{errors.name.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Gender *</label>
            <select {...register('gender', { required: true })} className={selectCls + ' w-full'} disabled={isEdit}>
              <option value="M">Boys</option>
              <option value="F">Girls</option>
            </select>
            {isEdit && <p className="text-[11px] text-gray-400 mt-1">Can't change once students are assigned.</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Capacity *</label>
            <input type="number" min="1" {...register('capacity', { required: true, min: 1 })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Warden / Matron</label>
          <select {...register('warden')} className={selectCls + ' w-full'}>
            <option value="">— None —</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
          <input {...register('location')} placeholder="e.g. North block"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
          <textarea {...register('notes')} rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saveMut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Dormitory'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteDormitoryModal({ dorm, onClose }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => deleteDormitory(dorm.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dormitories'] })
      toast.success('Dormitory removed.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed — it may still have students assigned.'),
  })
  return (
    <Modal isOpen title="Remove Dormitory" onClose={onClose} size="sm">
      <div className="p-6 space-y-4">
        <p className="text-sm text-gray-600">Remove <strong>{dorm.name}</strong>? This cannot be undone.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="flex-1 py-2.5 bg-danger text-white rounded-lg text-sm font-medium hover:bg-danger/90 disabled:opacity-50">
            {mut.isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Dormitories tab ─────────────────────────────────────────────────────────────

function DormitoriesTab({ canManage }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editDorm, setEditDorm] = useState(null)
  const [deleteDorm, setDeleteDorm] = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['dormitories'], queryFn: () => getDormitories() })
  const dorms = data?.results ?? data ?? []

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
            <Plus size={14} /> Add Dormitory
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-32" />)}
        </div>
      ) : dorms.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          <Building2 size={28} className="mx-auto text-gray-200 mb-2" />
          No dormitories set up yet.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dorms.map((d) => {
            const pct = d.capacity > 0 ? Math.min(100, Math.round((d.occupied_count / d.capacity) * 100)) : 0
            const barColor = pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-accent' : 'bg-success'
            return (
              <div key={d.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{d.name}</p>
                    <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${d.gender === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                      {GENDER_LABEL[d.gender]}
                    </span>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditDorm(d)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><Edit2 size={13} /></button>
                      <button onClick={() => setDeleteDorm(d)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-danger"><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>

                {d.warden_name && <p className="text-xs text-gray-500 mt-2">Warden: {d.warden_name}</p>}
                {d.location && <p className="text-xs text-gray-400">{d.location}</p>}

                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>{d.occupied_count} / {d.capacity} beds</span>
                    <span>{d.available_beds} free</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && <DormitoryModal onClose={() => setShowAdd(false)} />}
      {editDorm && <DormitoryModal dorm={editDorm} onClose={() => setEditDorm(null)} />}
      {deleteDorm && <DeleteDormitoryModal dorm={deleteDorm} onClose={() => setDeleteDorm(null)} />}
    </div>
  )
}

// ── Assign student modal ─────────────────────────────────────────────────────────

function AssignModal({ onClose }) {
  const qc = useQueryClient()
  const { levelOptions } = useSchoolLevels()
  const [dormitory, setDormitory] = useState('')
  const [level, setLevel] = useState('')
  const [stream, setStream] = useState('')
  const [student, setStudent] = useState(null)
  const [bedNumber, setBedNumber] = useState('')
  const [academicYear, setAcademicYear] = useState('')

  const { data: yearsData } = useQuery({ queryKey: ['boarding-academic-years'], queryFn: getAcademicYears })
  const years = yearsData?.results ?? yearsData ?? []
  const effectiveYear = academicYear || years.find((y) => y.is_current)?.id || ''

  const { data: dormData } = useQuery({ queryKey: ['dormitories-all'], queryFn: () => getDormitories() })
  const dorms = dormData?.results ?? dormData ?? []
  const selectedDorm = dorms.find((d) => String(d.id) === String(dormitory))

  const studentsQ = useQuery({
    queryKey: ['boarding-class-students', level, stream, selectedDorm?.gender],
    queryFn: () => getStudents({
      level, stream: stream || undefined, gender: selectedDorm.gender, status: 'ACTIVE', all: 'true',
    }),
    enabled: !!level && !!selectedDorm,
  })
  const classStudents = studentsQ.data?.results ?? studentsQ.data ?? []

  const saveMut = useMutation({
    mutationFn: () => createBoardingAssignment({
      student: student.id, dormitory, academic_year: effectiveYear, bed_number: bedNumber,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boarding-assignments'] })
      qc.invalidateQueries({ queryKey: ['dormitories'] })
      toast.success('Student assigned.')
      onClose()
    },
    onError: (err) => {
      const data = err.response?.data
      toast.error(data?.dormitory?.[0] ?? data?.detail ?? 'Failed to assign.')
    },
  })

  return (
    <Modal isOpen title="Assign Student to Dormitory" onClose={onClose} size="sm">
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Dormitory *</label>
          <select
            value={dormitory}
            onChange={(e) => { setDormitory(e.target.value); setStudent(null) }}
            className={selectCls + ' w-full'}
          >
            <option value="">Select…</option>
            {dorms.map((d) => (
              <option key={d.id} value={d.id}>{d.name} — {GENDER_LABEL[d.gender]} ({d.available_beds} free)</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Class *</label>
            <select
              value={level}
              onChange={(e) => { setLevel(e.target.value); setStudent(null) }}
              disabled={!dormitory}
              className={selectCls + ' w-full'}
            >
              <option value="">{dormitory ? 'Select…' : 'Pick a dormitory first'}</option>
              {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Stream</label>
            <input
              value={stream}
              onChange={(e) => { setStream(e.target.value); setStudent(null) }}
              disabled={!dormitory}
              placeholder="Optional"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Student *</label>
          <StudentPicker
            students={classStudents}
            selected={student}
            onSelect={setStudent}
            onClear={() => setStudent(null)}
            disabled={!level || !selectedDorm}
            placeholder={!dormitory ? 'Pick a dormitory first' : !level ? 'Pick a class first' : 'Search this class…'}
          />
          {level && selectedDorm && (
            <p className="text-[11px] text-gray-400 mt-1">
              Showing {GENDER_LABEL[selectedDorm.gender]} students in {LEVEL_LABEL[level] ?? level}{stream ? ` ${stream}` : ''} only
              — matches {selectedDorm.name}'s gender.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Academic Year</label>
            <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className={selectCls + ' w-full'}>
              <option value="">Current year</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.year}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Bed number</label>
            <input value={bedNumber} onChange={(e) => setBedNumber(e.target.value)} placeholder="Optional"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={!student || !dormitory || !effectiveYear || saveMut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saveMut.isPending ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Assignments tab ──────────────────────────────────────────────────────────────

function AssignmentsTab({ canManage }) {
  const qc = useQueryClient()
  const [showAssign, setShowAssign] = useState(false)
  const [showVacated, setShowVacated] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['boarding-assignments', showVacated],
    queryFn: () => getBoardingAssignments({ active: showVacated ? undefined : 'true' }),
  })
  const assignments = data?.results ?? data ?? []

  const vacateMut = useMutation({
    mutationFn: (id) => vacateBoardingAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boarding-assignments'] })
      qc.invalidateQueries({ queryKey: ['dormitories'] })
      toast.success('Student vacated from dormitory.')
    },
    onError: () => toast.error('Failed to vacate.'),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => deleteBoardingAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boarding-assignments'] })
      qc.invalidateQueries({ queryKey: ['dormitories'] })
      toast.success('Assignment removed.')
    },
    onError: () => toast.error('Failed to remove.'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600 select-none">
          <input type="checkbox" checked={showVacated} onChange={(e) => setShowVacated(e.target.checked)} className="rounded" />
          Show vacated
        </label>
        {canManage && (
          <button onClick={() => setShowAssign(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
            <Plus size={14} /> Assign Student
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Student</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Dormitory</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Bed</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Assigned</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded" /></td></tr>
              ))
            ) : assignments.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">
                <BedDouble size={28} className="mx-auto text-gray-200 mb-2" />
                No boarding assignments found.
              </td></tr>
            ) : assignments.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">{a.student_name}</td>
                <td className="px-4 py-3 text-gray-600">{a.dormitory_name}</td>
                <td className="px-4 py-3 text-gray-500">{a.bed_number || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{fmtDate(a.assigned_at)}</td>
                <td className="px-4 py-3">
                  {a.is_active
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Vacated</span>}
                </td>
                {canManage && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {a.is_active && (
                        <button onClick={() => vacateMut.mutate(a.id)} title="Vacate"
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                          <LogOut size={13} />
                        </button>
                      )}
                      <button onClick={() => deleteMut.mutate(a.id)} title="Delete"
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-danger">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAssign && <AssignModal onClose={() => setShowAssign(false)} />}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BoardingPage() {
  const { user } = useAuth()
  const canManage = MANAGE_ROLES.includes(user?.role)
  const [tab, setTab] = useState('dormitories')

  const tabs = [
    { id: 'dormitories', label: 'Dormitories' },
    { id: 'assignments', label: 'Assignments' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Boarding</h1>
        <p className="text-sm text-gray-500 mt-0.5">Dormitories are strictly single-gender — boys and girls are never mixed.</p>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'dormitories' && <DormitoriesTab canManage={canManage} />}
      {tab === 'assignments' && <AssignmentsTab canManage={canManage} />}
    </div>
  )
}
