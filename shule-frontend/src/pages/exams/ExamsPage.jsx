import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart2,
  ChevronRight,
  ClipboardList,
  Loader2,
  PenLine,
  Plus,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { createExam, getExams } from '../../api/exams'
import { getAcademicYears } from '../../api/fees'
import Skeleton from '../../components/ui/Skeleton'
import { LEVEL_LABEL, LEVEL_OPTIONS } from '../../lib/constants'

const TERM_OPTIONS = [
  { value: 'TERM1', label: 'Term 1' },
  { value: 'TERM2', label: 'Term 2' },
  { value: 'TERM3', label: 'Term 3' },
]

const EXAM_TYPES = [
  { value: 'CA1',      label: 'Continuous Assessment 1' },
  { value: 'CA2',      label: 'Continuous Assessment 2' },
  { value: 'MIDTERM',  label: 'Mid-Term' },
  { value: 'TERMINAL', label: 'Terminal' },
  { value: 'MOCK',     label: 'Mock' },
]

const TYPE_BADGE = {
  CA1:      'bg-blue-100 text-blue-700',
  CA2:      'bg-blue-100 text-blue-700',
  MIDTERM:  'bg-purple-100 text-purple-700',
  TERMINAL: 'bg-primary/10 text-primary',
  MOCK:     'bg-gray-100 text-gray-600',
}

const selectCls = `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

const inputCls = `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

// ── Create Exam Modal ──────────────────────────────────────────────────────

function CreateExamModal({ onClose }) {
  const queryClient = useQueryClient()

  const { data: yearsData } = useQuery({
    queryKey: ['academic-years'],
    queryFn: getAcademicYears,
  })
  const years = yearsData?.results ?? yearsData ?? []

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: '', academic_year: '', term: '', level: '',
      stream: '', exam_type: '', start_date: '', end_date: '',
    },
  })

  const mutation = useMutation({
    mutationFn: createExam,
    onSuccess: () => {
      toast.success('Exam created.')
      queryClient.invalidateQueries({ queryKey: ['exams'] })
      onClose()
    },
    onError: (err) => {
      const detail = err.response?.data
      if (detail && typeof detail === 'object') {
        const msg = Object.values(detail).flat()[0]
        toast.error(String(msg))
      } else {
        toast.error('Could not create exam.')
      }
    },
  })

  function onSubmit(data) {
    mutation.mutate({
      ...data,
      academic_year: Number(data.academic_year),
    })
  }

  const Field = ({ label, error, required, children }) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-semibold text-gray-900">Create Exam</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <Field label="Exam Name" required error={errors.name?.message}>
            <input
              {...register('name', { required: 'Name is required' })}
              className={inputCls}
              placeholder="e.g. End of Term 1 Examination"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Academic Year" required error={errors.academic_year?.message}>
              <select {...register('academic_year', { required: 'Required' })} className={selectCls}>
                <option value="">Select year…</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>{y.year}{y.is_current ? ' (Current)' : ''}</option>
                ))}
              </select>
            </Field>

            <Field label="Term" required error={errors.term?.message}>
              <select {...register('term', { required: 'Required' })} className={selectCls}>
                <option value="">Select term…</option>
                {TERM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Level" required error={errors.level?.message}>
              <select {...register('level', { required: 'Required' })} className={selectCls}>
                <option value="">Select level…</option>
                {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>

            <Field label="Stream">
              <input {...register('stream')} className={inputCls} placeholder="Optional (e.g. A)" />
            </Field>
          </div>

          <Field label="Exam Type" required error={errors.exam_type?.message}>
            <select {...register('exam_type', { required: 'Required' })} className={selectCls}>
              <option value="">Select type…</option>
              {EXAM_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date" required error={errors.start_date?.message}>
              <input type="date" {...register('start_date', { required: 'Required' })} className={inputCls} />
            </Field>
            <Field label="End Date" required error={errors.end_date?.message}>
              <input type="date" {...register('end_date', { required: 'Required' })} className={inputCls} />
            </Field>
          </div>
        </form>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={mutation.isPending}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-secondary disabled:opacity-60 transition-colors"
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {mutation.isPending ? 'Creating…' : 'Create Exam'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ExamsPage() {
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [levelFilter, setLevelFilter] = useState('')
  const [termFilter,  setTermFilter]  = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['exams', levelFilter, termFilter],
    queryFn: () => getExams({
      level: levelFilter || undefined,
      term:  termFilter  || undefined,
    }),
  })

  const exams = data?.results ?? data ?? []

  const filterSelectCls = `border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-700
    focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className={filterSelectCls}>
          <option value="">All Levels</option>
          {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select value={termFilter} onChange={(e) => setTermFilter(e.target.value)} className={filterSelectCls}>
          <option value="">All Terms</option>
          {TERM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-primary text-white
            rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
        >
          <Plus size={15} />
          Create Exam
        </button>
      </div>

      {/* Exam list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <Skeleton className="h-4 w-64 mb-2" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-sm text-danger">Failed to load exams.</p>
        </div>
      ) : exams.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
          <ClipboardList size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">No exams yet. Click "Create Exam" to add one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-5
                hover:border-primary/30 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-gray-900">{exam.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[exam.exam_type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {EXAM_TYPES.find((t) => t.value === exam.exam_type)?.label ?? exam.exam_type}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>{LEVEL_LABEL[exam.level] ?? exam.level}{exam.stream ? ` · Stream ${exam.stream}` : ''}</span>
                    <span>{exam.term?.replace('TERM', 'Term ')}</span>
                    <span>{exam.start_date} → {exam.end_date}</span>
                    {exam.created_by_name && <span>by {exam.created_by_name}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/exams/${exam.id}/marks`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200
                      rounded-lg text-xs text-gray-600 hover:border-primary/40 hover:text-primary
                      hover:bg-primary/5 transition-colors"
                  >
                    <PenLine size={12} />
                    Enter Marks
                  </button>
                  <button
                    onClick={() => navigate(`/exams/${exam.id}/results`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary
                      rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors"
                  >
                    <BarChart2 size={12} />
                    Results
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateExamModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
