import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, CheckCircle, Edit2, Plus, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  activateSubject, createAdminSubject, deactivateSubject, getAdminSubjects, updateAdminSubject,
} from '../../api/sysadmin'
import { getStudents } from '../../api/students'
import Modal from '../../components/ui/Modal'
import { useSchoolLevels } from '../../hooks/useSchoolLevels'

const LG_BADGE = {
  PRIMARY: 'bg-blue-100 text-blue-700',
  OLEVEL:  'bg-purple-100 text-purple-700',
  ALEVEL:  'bg-orange-100 text-orange-700',
}

// ── Subject form modal ────────────────────────────────────────────────────────

function SubjectModal({ subject, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!subject
  const { levelGroups } = useSchoolLevels()
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: subject
      ? { name: subject.name, code: subject.code, level_group: subject.level_group, is_compulsory: subject.is_compulsory }
      : { level_group: 'PRIMARY', is_compulsory: false },
  })
  const mut = useMutation({
    mutationFn: (data) => isEdit ? updateAdminSubject(subject.id, data) : createAdminSubject(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-subjects'] })
      toast.success(isEdit ? 'Subject updated.' : 'Subject created.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed.'),
  })
  return (
    <Modal isOpen title={isEdit ? 'Edit Subject' : 'Add Subject'} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit(d => mut.mutate({ ...d, code: d.code.toUpperCase() }))} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Subject Name *</label>
          <input {...register('name', { required: 'Required' })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="e.g. Mathematics" />
          {errors.name && <p className="text-xs text-danger mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Code *</label>
          <input {...register('code', { required: 'Required' })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="e.g. MATH" />
          {errors.code && <p className="text-xs text-danger mt-1">{errors.code.message}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Level Group *</label>
          <select {...register('level_group')}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
            {levelGroups.map(lg => <option key={lg.value} value={lg.value}>{lg.label}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" {...register('is_compulsory')} className="rounded" />
          Compulsory subject
        </label>
        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={mut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {mut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Subject'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Toggle active/inactive confirm ────────────────────────────────────────────

function ToggleStatusModal({ subject, onClose }) {
  const qc = useQueryClient()
  const activating = !subject.is_active
  const mut = useMutation({
    mutationFn: () => activating ? activateSubject(subject.id) : deactivateSubject(subject.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-subjects'] })
      toast.success(activating ? 'Subject activated.' : 'Subject deactivated.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed.'),
  })
  return (
    <Modal isOpen title={activating ? 'Activate Subject' : 'Deactivate Subject'} onClose={onClose} size="sm">
      <div className="p-6 space-y-4">
        <p className="text-sm text-gray-600">
          {activating
            ? <>Activate <strong>{subject.code} — {subject.name}</strong>? It will become available for new exams.</>
            : <>Deactivate <strong>{subject.code} — {subject.name}</strong>? It will be hidden from new exams but historical data is preserved.</>
          }
        </p>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className={`flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 ${activating ? 'bg-green-600 hover:bg-green-700' : 'bg-danger hover:bg-danger/90'}`}>
            {mut.isPending
              ? (activating ? 'Activating…' : 'Deactivating…')
              : (activating ? 'Activate' : 'Deactivate')
            }
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function SubjectsTab() {
  const [showAdd, setShowAdd] = useState(false)
  const [editSubj, setEditSubj] = useState(null)
  const [toggleSubj, setToggleSubj] = useState(null)
  const [showInactive, setShowInactive] = useState(false)
  const [lgFilter, setLgFilter] = useState('')
  const { levelGroups } = useSchoolLevels()

  const q = useQuery({
    queryKey: ['admin-subjects', { include_inactive: showInactive }],
    queryFn: () => getAdminSubjects({ include_inactive: showInactive }),
  })
  const subjects = (q.data ?? []).filter(s => !lgFilter || s.level_group === lgFilter)

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select value={lgFilter} onChange={e => setLgFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none">
          <option value="">All levels</option>
          {levelGroups.map(lg => <option key={lg.value} value={lg.value}>{lg.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 ml-auto">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
          Show inactive
        </label>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
          <Plus size={14} /> Add Subject
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Code</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Name</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Level Group</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Compulsory</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {q.isLoading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i}>
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded" /></td>
                  ))}
                </tr>
              ))
            ) : subjects.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">
                  <BookOpen size={28} className="mx-auto text-gray-200 mb-2" />
                  No subjects found.
                </td>
              </tr>
            ) : (
              subjects.map(s => (
                <tr key={s.id} className={`hover:bg-gray-50/50 transition-colors ${!s.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{s.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${LG_BADGE[s.level_group]}`}>{s.level_group}</span>
                  </td>
                  <td className="px-4 py-3">
                    {s.is_compulsory
                      ? <CheckCircle size={16} className="text-success" />
                      : <XCircle size={16} className="text-gray-300" />}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditSubj(s)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 transition-colors">
                        <Edit2 size={13} />
                      </button>
                      {s.is_active ? (
                        <button onClick={() => setToggleSubj(s)}
                          title="Deactivate"
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-danger transition-colors">
                          <Trash2 size={13} />
                        </button>
                      ) : (
                        <button onClick={() => setToggleSubj(s)}
                          title="Activate"
                          className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors">
                          <RotateCcw size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAdd && <SubjectModal onClose={() => setShowAdd(false)} />}
      {editSubj && <SubjectModal subject={editSubj} onClose={() => setEditSubj(null)} />}
      {toggleSubj && <ToggleStatusModal subject={toggleSubj} onClose={() => setToggleSubj(null)} />}
    </div>
  )
}

function ClassesTab() {
  const q = useQuery({
    queryKey: ['students-all-classes'],
    queryFn: () => getStudents({ status: 'ACTIVE', all: 'true' }),
  })

  const classMap = {}
  ;(q.data?.results ?? q.data ?? []).forEach(s => {
    const key = `${s.level}${s.stream ? ' ' + s.stream : ''}`
    classMap[key] = (classMap[key] || 0) + 1
  })
  const classes = Object.entries(classMap).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        Classes are derived from active student enrolments. To add a stream, enrol a student into the new class.
      </p>
      {q.isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
              <div className="h-5 bg-gray-100 rounded mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {classes.map(([cls, count]) => (
            <div key={cls} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="font-bold text-gray-900 text-lg">{cls}</p>
              <p className="text-xs text-gray-500 mt-1">{count} student{count !== 1 ? 's' : ''}</p>
            </div>
          ))}
          {classes.length === 0 && (
            <div className="col-span-full text-center py-10 text-gray-400 text-sm">
              No active enrolments found.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SubjectsPage() {
  const [tab, setTab] = useState('subjects')
  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { key: 'subjects', label: 'Subjects' },
          { key: 'classes',  label: 'Classes & Streams' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'subjects' && <SubjectsTab />}
      {tab === 'classes'  && <ClassesTab />}
    </div>
  )
}
