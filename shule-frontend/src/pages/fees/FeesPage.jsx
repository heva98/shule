import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle,
  Loader2,
  MessageCircle,
  PenLine,
  Plus,
  Send,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  generateInvoices,
  getAcademicYears,
  getDefaulters,
  getFeeStructures,
  getInvoices,
  createFeeStructure,
  updateFeeStructure,
} from '../../api/fees'
import api from '../../lib/axios'
import RecordPaymentModal from '../../components/fees/RecordPaymentModal'
import Badge from '../../components/ui/Badge'
import Skeleton from '../../components/ui/Skeleton'
import Tabs from '../../components/ui/Tabs'
import {
  INVOICE_BADGE,
  LEVEL_LABEL,
  LEVEL_OPTIONS,
} from '../../lib/constants'
import { formatTZS } from '../../lib/format'

const TERM_OPTIONS = [
  { value: 'TERM1', label: 'Term 1' },
  { value: 'TERM2', label: 'Term 2' },
  { value: 'TERM3', label: 'Term 3' },
]

const STATUS_OPTIONS = [
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'PAID', label: 'Paid' },
  { value: 'OVERDUE', label: 'Overdue' },
]

const selectCls = `border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

const inputCls = `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

function daysOverdue(due_date) {
  const diff = Math.floor((Date.now() - new Date(due_date).getTime()) / 86400000)
  return Math.max(0, diff)
}

function waUrl(phone) {
  if (!phone) return null
  return `https://wa.me/${phone.replace(/\D/g, '')}`
}

// ── Generate Invoices Modal ────────────────────────────────────────────────

function GenerateInvoicesModal({ onClose }) {
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
      academic_year: '',
      term: '',
      level: '',
      due_date: '',
    },
  })

  const [result, setResult] = useState(null)

  const mutation = useMutation({
    mutationFn: generateInvoices,
    onSuccess: (data) => {
      setResult(data)
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (err) => {
      const detail = err.response?.data?.detail || 'Generation failed.'
      toast.error(detail)
    },
  })

  function onSubmit(data) {
    mutation.mutate({
      academic_year: Number(data.academic_year),
      term: data.term,
      level: data.level,
      due_date: data.due_date,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Generate Invoices</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="px-6 py-8 text-center">
            <CheckCircle size={40} className="mx-auto text-success mb-3" />
            <p className="font-semibold text-gray-900">{result.detail}</p>
            <p className="text-sm text-gray-500 mt-1">
              Amount per student: {formatTZS(result.amount_due)}
            </p>
            <button
              onClick={onClose}
              className="mt-6 px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium
                hover:bg-secondary transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Academic Year <span className="text-danger">*</span>
              </label>
              <select
                {...register('academic_year', { required: 'Required' })}
                className={`${selectCls} w-full`}
              >
                <option value="">Select year…</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.year} {y.is_current ? '(Current)' : ''}
                  </option>
                ))}
              </select>
              {errors.academic_year && (
                <p className="mt-1 text-xs text-danger">{errors.academic_year.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Term <span className="text-danger">*</span>
                </label>
                <select
                  {...register('term', { required: 'Required' })}
                  className={`${selectCls} w-full`}
                >
                  <option value="">Select term…</option>
                  {TERM_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {errors.term && (
                  <p className="mt-1 text-xs text-danger">{errors.term.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Level <span className="text-danger">*</span>
                </label>
                <select
                  {...register('level', { required: 'Required' })}
                  className={`${selectCls} w-full`}
                >
                  <option value="">Select level…</option>
                  {LEVEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {errors.level && (
                  <p className="mt-1 text-xs text-danger">{errors.level.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Due Date <span className="text-danger">*</span>
              </label>
              <input
                type="date"
                {...register('due_date', { required: 'Required' })}
                className={`${inputCls}`}
              />
              {errors.due_date && (
                <p className="mt-1 text-xs text-danger">{errors.due_date.message}</p>
              )}
            </div>

            <p className="text-xs text-gray-400">
              Invoices will be created for all active students at the selected level.
              Already existing invoices are skipped.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600
                  hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg
                  text-sm font-medium hover:bg-secondary disabled:opacity-60 transition-colors"
              >
                {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {mutation.isPending ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Invoices Tab ───────────────────────────────────────────────────────────

function InvoicesTab() {
  const [termFilter,   setTermFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [levelFilter,  setLevelFilter]  = useState('')
  const [page,         setPage]         = useState(1)
  const [showGenerate, setShowGenerate] = useState(false)
  const [payInvoice,   setPayInvoice]   = useState(null)

  useEffect(() => setPage(1), [termFilter, statusFilter, levelFilter])

  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoices', termFilter, statusFilter, levelFilter, page],
    queryFn: () =>
      getInvoices({
        term:   termFilter   || undefined,
        status: statusFilter || undefined,
        level:  levelFilter  || undefined,
        page,
      }),
    placeholderData: (prev) => prev,
  })

  const invoices   = data?.results ?? []
  const count      = data?.count   ?? 0
  const totalPages = Math.max(1, Math.ceil(count / 20))

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={termFilter} onChange={(e) => setTermFilter(e.target.value)} className={selectCls}>
          <option value="">All Terms</option>
          {TERM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className={selectCls}>
          <option value="">All Levels</option>
          {LEVEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <button
          onClick={() => setShowGenerate(true)}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-primary text-white
            rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
        >
          <Plus size={15} />
          Generate Invoices
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Student', 'Level', 'Term', 'Invoiced', 'Paid', 'Balance', 'Status'].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {[...Array(7)].map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-3.5 w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-danger">
                    Failed to load invoices.
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center text-sm text-gray-400">
                    No invoices found. Try adjusting the filters.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const bal = Number(inv.balance)
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => setPayInvoice(inv)}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{inv.student_name}</div>
                        <div className="text-xs text-gray-400 font-mono">{inv.student_id_display}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {LEVEL_LABEL[inv.student_level] ?? inv.student_level ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {inv.academic_year_label} · {inv.term?.replace('TERM', 'T')}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">
                        {formatTZS(inv.amount_due)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">
                        {formatTZS(inv.amount_paid)}
                      </td>
                      <td className={`px-4 py-3 font-mono text-xs whitespace-nowrap font-semibold ${
                        bal > 0 ? 'text-danger' : 'text-success'
                      }`}>
                        {formatTZS(bal)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={inv.status} colorClass={INVOICE_BADGE[inv.status]} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {count > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">{count} invoices</p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40
                  hover:bg-gray-50 transition-colors"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-xs text-gray-500">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40
                  hover:bg-gray-50 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showGenerate && <GenerateInvoicesModal onClose={() => setShowGenerate(false)} />}
      {payInvoice && (
        <RecordPaymentModal
          invoice={payInvoice}
          onClose={() => setPayInvoice(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['invoices'] })
            queryClient.invalidateQueries({ queryKey: ['defaulters'] })
          }}
        />
      )}
    </>
  )
}

// ── Defaulters Tab ─────────────────────────────────────────────────────────

function DefaultersTab() {
  const [termFilter,  setTermFilter]  = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [sending,     setSending]     = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['defaulters', termFilter, levelFilter],
    queryFn: () =>
      getDefaulters({
        term:  termFilter  || undefined,
        level: levelFilter || undefined,
      }),
  })

  const defaulters = Array.isArray(data) ? data : data?.results ?? []

  async function sendReminder(d) {
    try {
      const res = await api.post('/communications/fee-reminders/', { student_id: d.student_id })
      if (res.data.wa_url) window.open(res.data.wa_url, '_blank', 'noopener')
    } catch {
      toast.error(`Could not send reminder for ${d.student_name}`)
    }
  }

  async function sendAllReminders() {
    if (defaulters.length === 0) return
    setSending(true)
    let ok = 0
    await Promise.allSettled(
      defaulters.map((d) =>
        api
          .post('/communications/fee-reminders/', { student_id: d.student_id })
          .then(() => ok++)
      )
    )
    toast.success(`Reminders queued for ${ok} student${ok !== 1 ? 's' : ''}.`)
    setSending(false)
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={termFilter} onChange={(e) => setTermFilter(e.target.value)} className={selectCls}>
          <option value="">All Terms</option>
          {TERM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className={selectCls}>
          <option value="">All Levels</option>
          {LEVEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {defaulters.length > 0 && (
          <button
            onClick={sendAllReminders}
            disabled={sending}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 border border-gray-300
              rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {sending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            Send All Reminders
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Student', 'Level', 'Term', 'Balance (TZS)', 'Days Overdue', 'Action'].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((__, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-3.5 w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-danger">
                    Failed to load defaulters.
                  </td>
                </tr>
              ) : defaulters.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-sm text-gray-400">
                    No outstanding balances. All fees are up to date!
                  </td>
                </tr>
              ) : (
                defaulters.map((d) => {
                  const overdue = daysOverdue(d.due_date)
                  return (
                    <tr key={`${d.student_id}-${d.term}`} className="hover:bg-gray-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{d.student_name}</div>
                        <div className="text-xs text-gray-400 font-mono">{d.student_id}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {LEVEL_LABEL[d.level] ?? d.level}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {d.term?.replace('TERM', 'Term ')}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-danger whitespace-nowrap">
                        {formatTZS(d.balance)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {overdue > 0 ? (
                          <span className="text-xs font-semibold text-danger">{overdue}d overdue</span>
                        ) : (
                          <span className="text-xs text-gray-400">Due {d.due_date}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => sendReminder(d)}
                          className="flex items-center gap-1 text-xs text-white bg-[#25D366]
                            rounded-lg px-2.5 py-1.5 hover:bg-[#1ebe5d] transition-colors"
                        >
                          <MessageCircle size={12} />
                          Remind
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {defaulters.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">{defaulters.length} student{defaulters.length !== 1 ? 's' : ''} with outstanding balances</p>
          </div>
        )}
      </div>
    </>
  )
}

// ── Fee Structures Tab ─────────────────────────────────────────────────────

const FEE_FIELDS = [
  { key: 'tuition_fee',   label: 'Tuition' },
  { key: 'lunch_fee',     label: 'Lunch' },
  { key: 'transport_fee', label: 'Transport' },
  { key: 'uniform_fee',   label: 'Uniform' },
  { key: 'activity_fee',  label: 'Activity' },
]

function StructureRow({ structure, onSaved }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [vals, setVals] = useState({
    tuition_fee:   structure.tuition_fee,
    lunch_fee:     structure.lunch_fee,
    transport_fee: structure.transport_fee,
    uniform_fee:   structure.uniform_fee,
    activity_fee:  structure.activity_fee,
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await updateFeeStructure(structure.id, {
        tuition_fee:   Number(vals.tuition_fee)   || 0,
        lunch_fee:     Number(vals.lunch_fee)     || 0,
        transport_fee: Number(vals.transport_fee) || 0,
        uniform_fee:   Number(vals.uniform_fee)   || 0,
        activity_fee:  Number(vals.activity_fee)  || 0,
      })
      toast.success('Fee structure updated.')
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['fee-structures'] })
      onSaved?.()
    } catch {
      toast.error('Update failed.')
    } finally {
      setSaving(false)
    }
  }

  const total = FEE_FIELDS.reduce((sum, f) => sum + (Number(vals[f.key]) || 0), 0)

  return (
    <tr className="hover:bg-gray-50/40 transition-colors">
      <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-medium">
        {structure.academic_year_label}
      </td>
      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
        {LEVEL_LABEL[structure.level] ?? structure.level}
      </td>
      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
        {structure.term?.replace('TERM', 'Term ')}
      </td>
      {FEE_FIELDS.map((f) => (
        <td key={f.key} className="px-3 py-3 whitespace-nowrap">
          {editing ? (
            <input
              type="number"
              min="0"
              step="1"
              value={vals[f.key]}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
              className="w-24 border border-gray-300 rounded-md px-2 py-1 text-xs
                focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          ) : (
            <span className="text-xs font-mono text-gray-700">
              {formatTZS(structure[f.key])}
            </span>
          )}
        </td>
      ))}
      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs font-semibold text-primary">
        {editing ? formatTZS(total) : formatTZS(structure.total_fee)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {editing ? (
          <div className="flex gap-1.5">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-white rounded-lg
                text-xs hover:bg-secondary disabled:opacity-60 transition-colors"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
              Save
            </button>
            <button
              onClick={() => { setEditing(false); setVals({
                tuition_fee:   structure.tuition_fee,
                lunch_fee:     structure.lunch_fee,
                transport_fee: structure.transport_fee,
                uniform_fee:   structure.uniform_fee,
                activity_fee:  structure.activity_fee,
              }) }}
              className="px-2.5 py-1.5 border border-gray-200 text-gray-500 rounded-lg
                text-xs hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary
              border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <PenLine size={11} />
            Edit
          </button>
        )}
      </td>
    </tr>
  )
}

function AddStructureForm({ onDone }) {
  const queryClient = useQueryClient()
  const { data: yearsData } = useQuery({
    queryKey: ['academic-years'],
    queryFn: getAcademicYears,
  })
  const years = yearsData?.results ?? yearsData ?? []

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      academic_year: '', level: '', term: '',
      tuition_fee: 0, lunch_fee: 0, transport_fee: 0, uniform_fee: 0, activity_fee: 0,
    },
  })

  const mutation = useMutation({
    mutationFn: createFeeStructure,
    onSuccess: () => {
      toast.success('Fee structure created.')
      queryClient.invalidateQueries({ queryKey: ['fee-structures'] })
      onDone()
    },
    onError: (err) => {
      const detail = err.response?.data
      if (detail && typeof detail === 'object') {
        const msg = Object.values(detail).flat()[0]
        toast.error(String(msg))
      } else {
        toast.error('Could not create fee structure.')
      }
    },
  })

  function onSubmit(data) {
    mutation.mutate({
      academic_year: Number(data.academic_year),
      level: data.level,
      term: data.term,
      tuition_fee:   Number(data.tuition_fee)   || 0,
      lunch_fee:     Number(data.lunch_fee)     || 0,
      transport_fee: Number(data.transport_fee) || 0,
      uniform_fee:   Number(data.uniform_fee)   || 0,
      activity_fee:  Number(data.activity_fee)  || 0,
    })
  }

  const numCls = 'w-20 border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30'

  return (
    <tr className="bg-primary/5 border-b border-primary/20">
      <td className="px-3 py-2">
        <select {...register('academic_year', { required: true })} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs bg-white">
          <option value="">Year…</option>
          {years.map((y) => <option key={y.id} value={y.id}>{y.year}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <select {...register('level', { required: true })} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs bg-white">
          <option value="">Level…</option>
          {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <select {...register('term', { required: true })} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs bg-white">
          <option value="">Term…</option>
          {TERM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
      {FEE_FIELDS.map((f) => (
        <td key={f.key} className="px-3 py-2">
          <input type="number" min="0" step="1" {...register(f.key)} className={numCls} placeholder="0" />
        </td>
      ))}
      <td className="px-3 py-2 text-xs text-gray-400">—</td>
      <td className="px-3 py-2">
        <div className="flex gap-1.5">
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={mutation.isPending}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-white rounded-lg
              text-xs hover:bg-secondary disabled:opacity-60 transition-colors"
          >
            {mutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
            Add
          </button>
          <button
            onClick={onDone}
            className="px-2.5 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs
              hover:bg-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  )
}

function FeeStructuresTab() {
  const [adding, setAdding] = useState(false)
  const [yearFilter, setYearFilter] = useState('')

  const { data: yearsData } = useQuery({
    queryKey: ['academic-years'],
    queryFn: getAcademicYears,
  })
  const years = yearsData?.results ?? yearsData ?? []

  const { data, isLoading, isError } = useQuery({
    queryKey: ['fee-structures', yearFilter],
    queryFn: () => getFeeStructures(yearFilter ? { year: yearFilter } : {}),
  })
  const structures = data?.results ?? data ?? []

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className={selectCls}>
          <option value="">All Years</option>
          {years.map((y) => <option key={y.id} value={y.year}>{y.year}</option>)}
        </select>
        <button
          onClick={() => setAdding(true)}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-primary text-white
            rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
        >
          <Plus size={15} />
          Add Structure
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Year</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Level</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Term</th>
                {FEE_FIELDS.map((f) => (
                  <th key={f.key} className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {f.label}
                  </th>
                ))}
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {adding && <AddStructureForm onDone={() => setAdding(false)} />}
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(9)].map((__, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-3.5 w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-danger">
                    Failed to load fee structures.
                  </td>
                </tr>
              ) : structures.length === 0 && !adding ? (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center text-sm text-gray-400">
                    No fee structures yet. Click "Add Structure" to create one.
                  </td>
                </tr>
              ) : (
                structures.map((s) => (
                  <StructureRow key={s.id} structure={s} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

const TABS = [
  { id: 'invoices',    label: 'Invoices' },
  { id: 'defaulters',  label: 'Defaulters' },
  { id: 'structures',  label: 'Fee Structures' },
]

export default function FeesPage() {
  const [activeTab, setActiveTab] = useState('invoices')

  return (
    <div className="space-y-5">
      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
      {activeTab === 'invoices'   && <InvoicesTab />}
      {activeTab === 'defaulters' && <DefaultersTab />}
      {activeTab === 'structures' && <FeeStructuresTab />}
    </div>
  )
}
