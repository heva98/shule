import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle,
  Loader2,
  MessageCircle,
  Plus,
  Send,
} from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  getAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  getDefaulters,
  getInvoices,
} from '../../api/fees'
import { sendFeeReminder } from '../../api/communications'
import FeeConfigTab from './FeeConfigTab'
import GenerateChargesModal from './GenerateChargesModal'
import ReportsTab from './ReportsTab'
import StudentFeesTab from './StudentFeesTab'
import RecordPaymentModal from '../../components/fees/RecordPaymentModal'
import Badge from '../../components/ui/Badge'
import Skeleton from '../../components/ui/Skeleton'
import Tabs from '../../components/ui/Tabs'
import {
  INVOICE_BADGE,
  LEVEL_LABEL,
} from '../../lib/constants'
import { formatTZS } from '../../lib/format'
import { useSchoolLevels } from '../../hooks/useSchoolLevels'

const TERM_OPTIONS = [
  { value: 'TERM1', label: 'Term 1' },
  { value: 'TERM2', label: 'Term 2' },
]

const QUARTER_MAP = {
  TERM1: [
    { value: 'Q1', label: 'Quarter 1' },
    { value: 'Q2', label: 'Quarter 2' },
  ],
  TERM2: [
    { value: 'Q3', label: 'Quarter 3' },
    { value: 'Q4', label: 'Quarter 4' },
  ],
}

const ALL_QUARTERS = [
  { value: 'Q1', label: 'Q1' },
  { value: 'Q2', label: 'Q2' },
  { value: 'Q3', label: 'Q3' },
  { value: 'Q4', label: 'Q4' },
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

function fmtPeriod(term, quarter) {
  const t = term?.replace('TERM', 'T') ?? ''
  const q = quarter ?? ''
  return t && q ? `${t} · ${q}` : t || q || '—'
}

function daysOverdue(due_date) {
  const diff = Math.floor((Date.now() - new Date(due_date).getTime()) / 86400000)
  return Math.max(0, diff)
}

// ── Invoices Tab ───────────────────────────────────────────────────────────

function InvoicesTab() {
  const { levelOptions } = useSchoolLevels()
  const [termFilter,    setTermFilter]    = useState('')
  const [quarterFilter, setQuarterFilter] = useState('')
  const [statusFilter,  setStatusFilter]  = useState('')
  const [levelFilter,   setLevelFilter]   = useState('')
  const [page,          setPage]          = useState(1)
  const [showGenerate,  setShowGenerate]  = useState(false)
  const [payInvoice,    setPayInvoice]    = useState(null)

  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoices', termFilter, quarterFilter, statusFilter, levelFilter, page],
    queryFn: () =>
      getInvoices({
        term:    termFilter    || undefined,
        quarter: quarterFilter || undefined,
        status:  statusFilter  || undefined,
        level:   levelFilter   || undefined,
        page,
      }),
    placeholderData: (prev) => prev,
  })

  const invoices   = data?.results ?? []
  const count      = data?.count   ?? 0
  const totalPages = Math.max(1, Math.ceil(count / 20))

  const availableQuarters = termFilter ? (QUARTER_MAP[termFilter] ?? []) : ALL_QUARTERS

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={termFilter}
          onChange={(e) => { setTermFilter(e.target.value); setQuarterFilter(''); setPage(1) }}
          className={selectCls}
        >
          <option value="">All Terms</option>
          {TERM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={quarterFilter}
          onChange={(e) => { setQuarterFilter(e.target.value); setPage(1) }}
          className={selectCls}
        >
          <option value="">All Quarters</option>
          {availableQuarters.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select value={levelFilter} onChange={(e) => { setLevelFilter(e.target.value); setPage(1) }} className={selectCls}>
          <option value="">All Levels</option>
          {levelOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className={selectCls}>
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
          Generate Charges
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Student', 'Level', 'Period', 'Invoiced', 'Paid', 'Balance', 'Status'].map((h) => (
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
                        {inv.academic_year_label} · {fmtPeriod(inv.term, inv.quarter)}
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

      {showGenerate && <GenerateChargesModal onClose={() => setShowGenerate(false)} />}
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
  const { levelOptions } = useSchoolLevels()
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

  async function handleSendReminder(d) {
    try {
      await sendFeeReminder(d.student_id)
      toast.success(`Reminder sent for ${d.student_name}`)
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
        sendFeeReminder(d.student_id).then(() => ok++)
      )
    )
    toast.success(`Reminders queued for ${ok} student${ok !== 1 ? 's' : ''}.`)
    setSending(false)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={termFilter} onChange={(e) => setTermFilter(e.target.value)} className={selectCls}>
          <option value="">All Terms</option>
          {TERM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className={selectCls}>
          <option value="">All Levels</option>
          {levelOptions.map((o) => (
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

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Student', 'Level', 'Period', 'Balance (TZS)', 'Days Overdue', 'Action'].map((h) => (
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
                    <tr key={`${d.student_id}-${d.term}-${d.quarter}`} className="hover:bg-gray-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{d.student_name}</div>
                        <div className="text-xs text-gray-400 font-mono">{d.student_id}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {LEVEL_LABEL[d.level] ?? d.level}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fmtPeriod(d.term, d.quarter)}
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
                          onClick={() => handleSendReminder(d)}
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

// ── Academic Years Tab ─────────────────────────────────────────────────────

function AcademicYearsTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [newYear, setNewYear] = useState(new Date().getFullYear())

  const { data: yearsData, isLoading } = useQuery({
    queryKey: ['academic-years'],
    queryFn: getAcademicYears,
  })
  const years = (yearsData?.results ?? yearsData ?? [])
    .slice()
    .sort((a, b) => b.year - a.year)

  const createMut = useMutation({
    mutationFn: (year) => createAcademicYear({ year, is_current: years.length === 0 }),
    onSuccess: () => {
      toast.success('Academic year created')
      qc.invalidateQueries({ queryKey: ['academic-years'] })
      setShowForm(false)
    },
    onError: (err) => {
      const msg = err.response?.data?.year?.[0] || err.response?.data?.detail || 'Failed to create year'
      toast.error(msg)
    },
  })

  const markCurrentMut = useMutation({
    mutationFn: async (id) => {
      const current = years.find(y => y.is_current)
      if (current) await updateAcademicYear(current.id, { is_current: false })
      return updateAcademicYear(id, { is_current: true })
    },
    onSuccess: () => {
      toast.success('Current year updated')
      qc.invalidateQueries({ queryKey: ['academic-years'] })
    },
    onError: () => toast.error('Failed to update'),
  })

  function handleCreate(e) {
    e.preventDefault()
    if (!newYear) return
    createMut.mutate(Number(newYear))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Academic years are used across exams, fees, and reports. Mark one as <strong>Current</strong> to set the active school year.
        </p>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-secondary shrink-0 ml-4"
        >
          <Plus size={15} /> New Year
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="flex items-end gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
            <input
              type="number"
              className={inputCls + ' w-32'}
              value={newYear}
              onChange={e => setNewYear(e.target.value)}
              min={2000}
              max={2100}
              required
            />
          </div>
          <button
            type="submit"
            disabled={createMut.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-secondary disabled:opacity-60"
          >
            {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {createMut.isPending ? 'Creating…' : 'Create'}
          </button>
          <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : years.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-gray-400 mb-1">No academic years yet.</p>
            <p className="text-xs text-gray-400">Click <strong>New Year</strong> to add one, or run <code className="bg-gray-100 px-1 rounded">python manage.py seed_academic_year</code></p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Year</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {years.map(y => (
                <tr key={y.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{y.year}</td>
                  <td className="px-4 py-3">
                    {y.is_current ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        <CheckCircle size={11} /> Current
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!y.is_current && (
                      <button
                        onClick={() => markCurrentMut.mutate(y.id)}
                        disabled={markCurrentMut.isPending}
                        className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                      >
                        Set as Current
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

const TABS = [
  { id: 'invoices',    label: 'Invoices' },
  { id: 'student',     label: 'Student Fees' },
  { id: 'reports',     label: 'Reports' },
  { id: 'defaulters',  label: 'Defaulters' },
  { id: 'config',      label: 'Fee Configuration' },
  { id: 'years',       label: 'Academic Years' },
]

export default function FeesPage() {
  const [activeTab, setActiveTab] = useState('invoices')

  return (
    <div className="space-y-5">
      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
      {activeTab === 'invoices'    && <InvoicesTab />}
      {activeTab === 'student'     && <StudentFeesTab />}
      {activeTab === 'reports'     && <ReportsTab />}
      {activeTab === 'defaulters'  && <DefaultersTab />}
      {activeTab === 'config'      && <FeeConfigTab />}
      {activeTab === 'years'       && <AcademicYearsTab />}
    </div>
  )
}
