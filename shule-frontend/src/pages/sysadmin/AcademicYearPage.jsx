import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CheckCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { createAcademicYear, getAcademicYears, setCurrentYear } from '../../api/sysadmin'
import Modal from '../../components/ui/Modal'

function fmtRange(start, end) {
  if (!start && !end) return '—'
  const fmt = d => d ? new Date(d).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short' }) : '?'
  return `${fmt(start)} – ${fmt(end)}`
}

const QUARTERS = [
  { key: 'q1', label: 'Q1', term: 'Term 1', hint: 'Jan–Mar' },
  { key: 'q2', label: 'Q2', term: 'Term 1', hint: 'Apr–Jun' },
  { key: 'q3', label: 'Q3', term: 'Term 2', hint: 'Jul–Sep' },
  { key: 'q4', label: 'Q4', term: 'Term 2', hint: 'Oct–Nov' },
]

// ── Create year modal ─────────────────────────────────────────────────────────

function CreateYearModal({ onClose }) {
  const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { year: new Date().getFullYear() + 1 },
  })
  const mut = useMutation({
    mutationFn: createAcademicYear,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-academic-years'] })
      toast.success('Academic year created.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed.'),
  })

  function onSubmit(data) {
    // Basic date ordering validation
    const dates = QUARTERS.map(q => ({ start: data[`${q.key}_start`], end: data[`${q.key}_end`] }))
    for (const { start, end } of dates) {
      if (start && end && start > end) {
        toast.error('Start date must be before end date for each quarter.')
        return
      }
    }
    mut.mutate(data)
  }

  return (
    <Modal isOpen title="Create Academic Year" onClose={onClose} size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
        <div className="max-w-xs">
          <label className="block text-xs font-medium text-gray-700 mb-1">Year *</label>
          <input
            type="number"
            {...register('year', { required: 'Year required', min: { value: 2020, message: 'Min 2020' } })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {errors.year && <p className="text-xs text-danger mt-1">{errors.year.message}</p>}
        </div>

        <div className="space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quarter Date Ranges (optional)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {QUARTERS.map(q => (
              <div key={q.key} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-sm font-semibold text-gray-800">{q.label}</span>
                    <span className="ml-2 text-xs text-gray-400">{q.term}</span>
                  </div>
                  <span className="text-xs text-gray-400">{q.hint}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Start</label>
                    <input type="date" {...register(`${q.key}_start`)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">End</label>
                    <input type="date" {...register(`${q.key}_end`)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={mut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {mut.isPending ? 'Creating…' : 'Create Year'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Set current confirm ───────────────────────────────────────────────────────

function SetCurrentModal({ year, onClose }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => setCurrentYear(year.id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-academic-years'] })
      toast.success(data.detail)
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed.'),
  })
  return (
    <Modal isOpen title="Set Current Year" onClose={onClose} size="sm">
      <div className="p-6 space-y-4">
        <p className="text-sm text-gray-600">
          Set <strong>{year.year}</strong> as the current academic year? This will deactivate the previously active year.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Set as Current'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AcademicYearPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [setCurrent, setSetCurrent] = useState(null)

  const q = useQuery({ queryKey: ['admin-academic-years'], queryFn: getAcademicYears })
  const years = q.data ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Manage academic years and their quarterly date ranges.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          <Plus size={14} /> Create Year
        </button>
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse space-y-3">
              <div className="h-6 bg-gray-100 rounded w-1/3" />
              <div className="h-3 bg-gray-100 rounded" />
              <div className="h-3 bg-gray-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : years.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400">
          <CalendarDays size={36} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm">No academic years configured yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {years.map(y => (
            <div key={y.id} className={`bg-white rounded-xl border shadow-sm p-5 space-y-4 ${
              y.is_current ? 'border-primary/40 ring-2 ring-primary/20' : 'border-gray-100'
            }`}>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-gray-900">{y.year}</span>
                  {y.is_current && (
                    <span className="flex items-center gap-1 text-xs bg-primary text-white px-2 py-0.5 rounded-full">
                      <CheckCircle size={10} /> CURRENT
                    </span>
                  )}
                </div>
              </div>

              {/* Quarter dates */}
              <div className="space-y-1.5">
                {QUARTERS.map(q => (
                  <div key={q.key} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-6 h-5 bg-gray-100 text-gray-600 font-semibold rounded flex items-center justify-center">
                        {q.label}
                      </span>
                      <span className="text-gray-400">{q.term}</span>
                    </div>
                    <span className="text-gray-600">{fmtRange(y[`${q.key}_start`], y[`${q.key}_end`])}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              {!y.is_current && (
                <button
                  onClick={() => setSetCurrent(y)}
                  className="w-full py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:border-primary/40 hover:text-primary transition-colors"
                >
                  Set as Current Year
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateYearModal onClose={() => setShowCreate(false)} />}
      {setCurrent && <SetCurrentModal year={setCurrent} onClose={() => setSetCurrent(null)} />}
    </div>
  )
}
