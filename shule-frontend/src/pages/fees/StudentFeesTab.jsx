import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Shirt, Sparkles, Trash2, Wallet } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { getAcademicYears, getReceipt } from '../../api/fees'
import {
  assignUniform, getInvoiceLines, getPayments, getStudentFeeSummary,
  reversePayment, voidInvoiceLine,
} from '../../api/feeCharges'
import Badge from '../../components/ui/Badge'
import ReceiptView from '../../components/fees/ReceiptView'
import ReceivePaymentModal from '../../components/fees/ReceivePaymentModal'
import StudentPicker from '../../components/fees/StudentPicker'
import UniformSaleModal from '../../components/fees/UniformSaleModal'
import { LEVEL_LABEL } from '../../lib/constants'
import { formatTZS } from '../../lib/format'
import GenerateChargesModal from './GenerateChargesModal'

const selectCls = `border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

function SummaryTable({ summary }) {
  const t = summary.totals
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3">Fee</th>
              <th className="text-right px-4 py-3">Required</th>
              <th className="text-right px-4 py-3">Paid</th>
              <th className="text-right px-4 py-3">Outstanding</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {summary.categories.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">
                No charges assigned for this year yet.
              </td></tr>
            ) : summary.categories.map((c) => (
              <tr key={c.category} className="hover:bg-gray-50/60">
                <td className="px-4 py-3 font-medium text-gray-900">{c.category_display}</td>
                <td className="px-4 py-3 text-right">{formatTZS(c.required)}</td>
                <td className="px-4 py-3 text-right text-success">{formatTZS(c.paid)}</td>
                <td className="px-4 py-3 text-right text-danger">{formatTZS(c.outstanding)}</td>
                <td className="px-4 py-3">
                  <Badge status={c.status} />
                </td>
              </tr>
            ))}
          </tbody>
          {summary.categories.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-100 font-semibold text-gray-900 bg-gray-50/40">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{formatTZS(t.required)}</td>
                <td className="px-4 py-3 text-right">{formatTZS(t.paid)}</td>
                <td className="px-4 py-3 text-right">{formatTZS(t.outstanding)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {Number(summary.available_credit) > 0 && (
        <div className="px-4 py-3 text-sm border-t border-gray-100 bg-emerald-50/50 flex justify-between">
          <span className="text-emerald-700">Carried credit available</span>
          <span className="font-semibold text-emerald-700">{formatTZS(summary.available_credit)}</span>
        </div>
      )}
      {Number(summary.available_credit) > 0 && (
        <div className="px-4 py-2 text-sm border-t border-gray-100 flex justify-between">
          <span className="text-gray-500">Net outstanding after credit</span>
          <span className="font-semibold text-gray-900">{formatTZS(summary.net_outstanding)}</span>
        </div>
      )}
    </div>
  )
}

function PaymentsList({ studentId, yearId }) {
  const qc = useQueryClient()
  const [openReceipt, setOpenReceipt] = useState(null)

  const { data } = useQuery({
    queryKey: ['student-payments', studentId, yearId],
    queryFn: () => getPayments({ student: studentId, academic_year: yearId }),
  })
  const payments = data?.results ?? data ?? []

  const reverseMut = useMutation({
    mutationFn: ({ id, reason }) => reversePayment(id, reason),
    onSuccess: async (_r, { id }) => {
      toast.success('Payment reversed')
      qc.invalidateQueries({ queryKey: ['student-payments', studentId, yearId] })
      qc.invalidateQueries({ queryKey: ['student-fee-summary', studentId, yearId] })
      qc.invalidateQueries({ queryKey: ['invoice-lines', studentId, yearId] })
      setOpenReceipt(await getReceipt(id))
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Could not reverse'),
  })

  if (payments.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-100">
        Payments
      </div>
      <div className="divide-y divide-gray-50">
        {payments.map((p) => (
          <div key={p.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
            <span className="font-mono text-xs text-gray-500 w-32">{p.receipt_number}</span>
            <span className="text-gray-400 text-xs">
              {new Date(p.paid_at).toLocaleDateString('en-TZ', { dateStyle: 'medium' })}
            </span>
            <span className="text-gray-500 text-xs">{p.payment_method?.replace(/_/g, ' ')}</span>
            <span className={`ml-auto font-mono ${p.status === 'REVERSED' ? 'line-through text-gray-400' : ''}`}>
              {formatTZS(p.amount)}
            </span>
            {p.status === 'REVERSED'
              ? <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">reversed</span>
              : (
                <button
                  onClick={async () => setOpenReceipt(await getReceipt(p.id))}
                  className="text-xs text-primary hover:underline"
                >
                  receipt
                </button>
              )}
          </div>
        ))}
      </div>

      {openReceipt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setOpenReceipt(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <ReceiptView
              receipt={openReceipt}
              onClose={() => setOpenReceipt(null)}
              onReverse={() => {
                const reason = window.prompt('Reason for reversing this payment?')
                if (reason && reason.trim()) reverseMut.mutate({ id: openReceipt.id, reason: reason.trim() })
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function LinesList({ studentId, yearId }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['invoice-lines', studentId, yearId],
    queryFn: () => getInvoiceLines({ student: studentId, academic_year: yearId }),
  })
  const lines = data?.results ?? data ?? []

  const voidMut = useMutation({
    mutationFn: ({ id, reason }) => voidInvoiceLine(id, reason),
    onSuccess: () => {
      toast.success('Charge voided')
      qc.invalidateQueries({ queryKey: ['invoice-lines', studentId, yearId] })
      qc.invalidateQueries({ queryKey: ['student-fee-summary', studentId, yearId] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Could not void'),
  })

  const active = lines.filter((l) => l.status !== 'VOID')
  if (active.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-100">
        Individual charges
      </div>
      <div className="divide-y divide-gray-50">
        {active.map((l) => {
          const paid = Number(l.amount_allocated) > 0
          return (
            <div key={l.id} className="px-4 py-3 flex items-center gap-3 text-sm">
              <span className="font-medium text-gray-800 w-28">{l.category_display}</span>
              <span className="text-gray-500">{l.description || '—'}</span>
              {l.is_legacy && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">legacy</span>}
              <span className="ml-auto font-mono">{formatTZS(l.amount)}</span>
              <Badge status={l.status} />
              <button
                disabled={paid || l.is_legacy || voidMut.isPending}
                onClick={() => {
                  const reason = window.prompt('Reason for voiding this charge?')
                  if (reason !== null) voidMut.mutate({ id: l.id, reason })
                }}
                title={paid ? 'Has payments — cannot void' : l.is_legacy ? 'Legacy — cannot void' : 'Void charge'}
                className="p-1.5 rounded-md text-gray-400 hover:text-danger hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function StudentFeesTab() {
  const qc = useQueryClient()
  const [student, setStudent] = useState(null)
  const [pickedYearId, setPickedYearId] = useState('')
  const [showGenerate, setShowGenerate] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [showSale, setShowSale] = useState(false)

  const { data: yearsData } = useQuery({ queryKey: ['academic-years'], queryFn: getAcademicYears })
  const years = (yearsData?.results ?? yearsData ?? []).slice().sort((a, b) => b.year - a.year)
  const defaultYear = years.find((y) => y.is_current) || years[0]
  const yearId = pickedYearId || (defaultYear ? String(defaultYear.id) : '')

  const { data: summary, isLoading } = useQuery({
    queryKey: ['student-fee-summary', student?.id, yearId],
    queryFn: () => getStudentFeeSummary({ student: student.id, academic_year: yearId }),
    enabled: !!student && !!yearId,
  })

  const uniformMut = useMutation({
    mutationFn: (amount_override) => assignUniform({
      academic_year: Number(yearId),
      student_ids: [student.id],
      amount_override: amount_override ?? null,
    }),
    onSuccess: (r) => {
      toast.success(r.created ? 'Uniform assigned' : r.updated ? 'Uniform updated' : 'No change')
      qc.invalidateQueries({ queryKey: ['student-fee-summary', student.id, yearId] })
      qc.invalidateQueries({ queryKey: ['invoice-lines', student.id, yearId] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Could not assign uniform'),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StudentPicker onPick={setStudent} />
        <select className={selectCls} value={yearId} onChange={(e) => setPickedYearId(e.target.value)}>
          <option value="">Year…</option>
          {years.map((y) => <option key={y.id} value={y.id}>{y.year}{y.is_current ? ' (Current)' : ''}</option>)}
        </select>
        <button
          onClick={() => setShowSale(true)}
          className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Shirt size={15} /> Uniform Sale
        </button>
        <button
          onClick={() => setShowGenerate(true)}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-secondary"
        >
          <Sparkles size={15} /> Generate Charges
        </button>
      </div>

      {!student ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">
          Search for a student to view their fee assignment.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <div className="font-semibold text-gray-900">{student.full_name}</div>
              <div className="text-xs text-gray-400 font-mono">
                {student.student_id} · {LEVEL_LABEL[student.level] || student.level}
              </div>
            </div>
            <button
              onClick={() => {
                const raw = window.prompt('Uniform amount override (leave blank for the standard class rate):')
                if (raw === null) return
                const val = raw.trim() === '' ? undefined : Number(raw)
                if (raw.trim() !== '' && (Number.isNaN(val) || val < 0)) {
                  toast.error('Enter a valid amount')
                  return
                }
                uniformMut.mutate(val)
              }}
              disabled={uniformMut.isPending || !yearId}
              className="ml-auto px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {uniformMut.isPending ? <Loader2 size={13} className="animate-spin inline" /> : 'Assign / update uniform'}
            </button>
            <button
              onClick={() => setShowReceive(true)}
              disabled={!yearId}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-success text-white rounded-lg text-sm font-medium hover:brightness-95 disabled:opacity-50"
            >
              <Wallet size={15} /> Receive Payment
            </button>
          </div>

          {isLoading || !summary ? (
            <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-sm text-gray-400">Loading…</div>
          ) : (
            <>
              <SummaryTable summary={summary} />
              <LinesList studentId={student.id} yearId={yearId} />
              <PaymentsList studentId={student.id} yearId={yearId} />
            </>
          )}
        </>
      )}

      {showGenerate && <GenerateChargesModal onClose={() => setShowGenerate(false)} />}
      {showSale && (
        <UniformSaleModal
          student={student}
          onClose={() => setShowSale(false)}
          onSuccess={() => {
            if (student) {
              qc.invalidateQueries({ queryKey: ['invoice-lines', student.id, yearId] })
              qc.invalidateQueries({ queryKey: ['student-payments', student.id, yearId] })
            }
          }}
        />
      )}
      {showReceive && student && (
        <ReceivePaymentModal
          student={student}
          academicYear={Number(yearId)}
          onClose={() => setShowReceive(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['student-fee-summary', student.id, yearId] })
            qc.invalidateQueries({ queryKey: ['invoice-lines', student.id, yearId] })
            qc.invalidateQueries({ queryKey: ['student-payments', student.id, yearId] })
          }}
        />
      )}
    </div>
  )
}
