import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Edit2, Package, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  createHomePackage,
  deleteHomePackage,
  getHomePackages,
  updateHomePackage,
} from '../../api/homepackages'
import { getAcademicYears } from '../../api/fees'
import { getSubjects } from '../../api/exams'
import { useAuth } from '../../context/AuthContext'
import { useSchoolLevels } from '../../hooks/useSchoolLevels'
import { LEVEL_LABEL } from '../../lib/constants'
import Modal from '../../components/ui/Modal'

const CREATE_ROLES = ['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'TEACHER']
const SENIOR_ROLES = ['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER']

const QUARTER_OPTIONS = [
  { value: 'Q1', label: 'Quarter 1' },
  { value: 'Q2', label: 'Quarter 2' },
  { value: 'Q3', label: 'Quarter 3' },
  { value: 'Q4', label: 'Quarter 4' },
]

const selectCls = `border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-700
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Create / edit modal ────────────────────────────────────────────────────────

function PackageModal({ pkg, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!pkg
  const { levelOptions } = useSchoolLevels()

  const { data: yearsData } = useQuery({ queryKey: ['hp-academic-years'], queryFn: getAcademicYears })
  const years = yearsData?.results ?? yearsData ?? []

  const { data: subjectData } = useQuery({ queryKey: ['hp-subjects'], queryFn: () => getSubjects({ all: 'true' }) })
  const subjects = Array.isArray(subjectData) ? subjectData : (subjectData?.results ?? [])

  const [attachment, setAttachment] = useState(null)

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: pkg
      ? {
          title: pkg.title, instructions: pkg.instructions, subject: pkg.subject,
          level: pkg.level, stream: pkg.stream, academic_year: pkg.academic_year,
          quarter: pkg.quarter, due_date: pkg.due_date,
        }
      : { academic_year: years.find((y) => y.is_current)?.id ?? '' },
  })

  const saveMut = useMutation({
    mutationFn: (data) => {
      const fd = new FormData()
      Object.entries(data).forEach(([key, value]) => {
        if (value !== '' && value != null) fd.append(key, value)
      })
      if (attachment) fd.append('attachment', attachment)
      return isEdit ? updateHomePackage(pkg.id, fd) : createHomePackage(fd)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['home-packages'] })
      toast.success(isEdit ? 'Package updated.' : 'Package posted.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save.'),
  })

  return (
    <Modal isOpen title={isEdit ? 'Edit Home Package' : 'Post Home Package'} onClose={onClose} size="md">
      <form onSubmit={handleSubmit((d) => saveMut.mutate(d))} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
          <input {...register('title', { required: 'Required' })} placeholder="e.g. Term 1 Holiday Package"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {errors.title && <p className="text-xs text-danger mt-1">{errors.title.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Subject *</label>
            <select {...register('subject', { required: true })} className={selectCls + ' w-full'}>
              <option value="">Select…</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Academic Year *</label>
            <select {...register('academic_year', { required: true })} className={selectCls + ' w-full'}>
              <option value="">Select…</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.year}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Level *</label>
            <select {...register('level', { required: true })} className={selectCls + ' w-full'}>
              <option value="">Select…</option>
              {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Stream</label>
            <input {...register('stream')} placeholder="Optional"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Quarter *</label>
            <select {...register('quarter', { required: true })} className={selectCls + ' w-full'}>
              <option value="">Select…</option>
              {QUARTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Due back on *</label>
          <input type="date" {...register('due_date', { required: true })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Instructions</label>
          <textarea {...register('instructions')} rows={4} placeholder="What should students do during the break?"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Attachment {isEdit && pkg.attachment && <span className="text-gray-400 font-normal">(leave blank to keep existing)</span>}
          </label>
          <input type="file" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:text-sm" />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saveMut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Post Package'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Delete confirm ─────────────────────────────────────────────────────────────

function DeleteModal({ pkg, onClose }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => deleteHomePackage(pkg.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['home-packages'] })
      toast.success('Package removed.')
      onClose()
    },
    onError: () => toast.error('Failed to remove.'),
  })
  return (
    <Modal isOpen title="Remove Home Package" onClose={onClose} size="sm">
      <div className="p-6 space-y-4">
        <p className="text-sm text-gray-600">Remove <strong>{pkg.title}</strong>? This cannot be undone.</p>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HomePackagesPage() {
  const { user } = useAuth()
  const { levelOptions } = useSchoolLevels()
  const canCreate = CREATE_ROLES.includes(user?.role)

  const [level, setLevel] = useState('')
  const [stream, setStream] = useState('')
  const [quarter, setQuarter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editPkg, setEditPkg] = useState(null)
  const [deletePkg, setDeletePkg] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['home-packages', level, stream, quarter],
    queryFn: () => getHomePackages({
      level: level || undefined, stream: stream || undefined, quarter: quarter || undefined,
    }),
  })
  const packages = data?.results ?? data ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Home Packages</h1>
          <p className="text-sm text-gray-500 mt-0.5">Holiday work handed out at the end of each quarter.</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 shrink-0">
            <Plus size={14} /> Post Package
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <select value={level} onChange={(e) => setLevel(e.target.value)} className={selectCls}>
          <option value="">All levels</option>
          {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input value={stream} onChange={(e) => setStream(e.target.value)} placeholder="Stream (optional)"
          className={`${selectCls} sm:w-40`} />
        <select value={quarter} onChange={(e) => setQuarter(e.target.value)} className={selectCls}>
          <option value="">All quarters</option>
          {QUARTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-32" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          <Package size={28} className="mx-auto text-gray-200 mb-2" />
          No home packages found.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((pkg) => {
            const canEditThis = pkg.posted_by === user?.id || SENIOR_ROLES.includes(user?.role)
            return (
              <div key={pkg.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{pkg.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {pkg.subject_code} · {LEVEL_LABEL[pkg.level] ?? pkg.level}{pkg.stream ? ` ${pkg.stream}` : ''}
                    </p>
                  </div>
                  {canEditThis && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditPkg(pkg)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => setDeletePkg(pkg)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-danger">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {pkg.instructions && (
                  <p className="text-xs text-gray-600 mt-2 line-clamp-3">{pkg.instructions}</p>
                )}

                <div className="mt-auto pt-3 flex items-center justify-between text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {pkg.quarter}
                  </span>
                  <span className="text-gray-400">Due {fmtDate(pkg.due_date)}</span>
                </div>

                {pkg.attachment && (
                  <a href={pkg.attachment} target="_blank" rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                    <Download size={12} /> Download attachment
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showAdd && <PackageModal onClose={() => setShowAdd(false)} />}
      {editPkg && <PackageModal pkg={editPkg} onClose={() => setEditPkg(null)} />}
      {deletePkg && <DeleteModal pkg={deletePkg} onClose={() => setDeletePkg(null)} />}
    </div>
  )
}
