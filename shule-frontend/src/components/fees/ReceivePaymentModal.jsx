import { useQuery } from '@tanstack/react-query'
import { Loader2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { getReceipt, recordPayment } from '../../api/fees'
import { getInvoiceLines, getStudentCredits } from '../../api/feeCharges'
import { formatTZS } from '../../lib/format'
import ReceiptView from './ReceiptView'

const inputCls = `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CARRIED_CREDIT', label: 'Carried Credit' },
]

export default function ReceivePaymentModal({ student, academicYear, onClose, onSuccess }) {
  const [receipt, setReceipt] = useState(null)
  const [method, setMethod] = useState('CASH')
  const [creditId, setCreditId] = useState('')
  const [txnId, setTxnId] = useState('')
  const [notes, setNotes] = useState('')
  const [amounts, setAmounts] = useState({}) // lineId -> string
  const [submitting, setSubmitting] = useState(false)

  const { data: linesData, isLoading } = useQuery({
    queryKey: ['pay-outstanding-lines', student.id, academicYear],
    queryFn: () => getInvoiceLines({ student: student.id, academic_year: academicYear, outstanding: 1 }),
  })
  const lines = linesData?.results ?? linesData ?? []

  const { data: creditsData } = useQuery({
    queryKey: ['pay-credits', student.id],
    queryFn: () => getStudentCredits({ student: student.id, available: 1 }),
  })
  const credits = creditsData?.results ?? creditsData ?? []
  const selectedCredit = credits.find((c) => String(c.id) === creditId)

  const total = useMemo(
    () => Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0),
    [amounts],
  )

  function setAmount(lineId, value) {
    setAmounts((a) => ({ ...a, [lineId]: value }))
  }

  function fill(line) {
    setAmount(line.id, String(Number(line.outstanding)))
  }

  async function submit() {
    const allocations_input = lines
      .map((l) => ({ invoice_line: l.id, amount: Number(amounts[l.id] || 0) }))
      .filter((a) => a.amount > 0)

    if (allocations_input.length === 0) return toast.error('Enter at least one amount.')
    for (const l of lines) {
      const amt = Number(amounts[l.id] || 0)
      if (amt > Number(l.outstanding)) {
        return toast.error(`${l.category_display}: exceeds outstanding ${formatTZS(l.outstanding)}`)
      }
    }
    if (method === 'CARRIED_CREDIT') {
      if (!selectedCredit) return toast.error('Choose a credit to draw from.')
      if (total > Number(selectedCredit.remaining_amount)) {
        return toast.error('Total exceeds the selected credit balance.')
      }
    }

    setSubmitting(true)
    try {
      const payload = {
        student: student.id,
        amount: String(total),
        payment_method: method,
        transaction_id: method === 'CARRIED_CREDIT' ? '' : txnId.trim(),
        notes: notes.trim(),
        paid_at: new Date().toISOString(),
        allocations_input,
      }
      if (method === 'CARRIED_CREDIT') payload.funded_from_credit = selectedCredit.id
      const payment = await recordPayment(payload)
      setReceipt(await getReceipt(payment.id))
      onSuccess?.()
    } catch (err) {
      const d = err.response?.data
      const msg = typeof d === 'object' && d
        ? (Array.isArray(Object.values(d)[0]) ? Object.values(d)[0][0] : String(Object.values(d)[0]))
        : 'Payment failed.'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[95vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        {receipt ? (
          <ReceiptView receipt={receipt} onClose={onClose} />
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="font-semibold text-gray-900">Receive Payment</h2>
                <p className="text-xs text-gray-400 mt-0.5">{student.full_name} · {student.student_id}</p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {isLoading ? (
                <div className="py-10 text-center text-sm text-gray-400">Loading outstanding charges…</div>
              ) : lines.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">Nothing outstanding for this year.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wide">
                      <th className="text-left py-2">Fee</th>
                      <th className="text-right py-2">Outstanding</th>
                      <th className="text-right py-2 w-36">Pay now</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2">
                          <div className="font-medium text-gray-800">{l.category_display}</div>
                          {l.description && <div className="text-xs text-gray-400">{l.description}</div>}
                        </td>
                        <td className="py-2 text-right text-danger">{formatTZS(l.outstanding)}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number" min="0" step="1"
                              className={inputCls}
                              value={amounts[l.id] ?? ''}
                              onChange={(e) => setAmount(l.id, e.target.value)}
                              placeholder="0"
                            />
                            <button type="button" onClick={() => fill(l)}
                              className="text-xs text-primary hover:underline shrink-0">all</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-100 font-semibold">
                      <td className="py-2">Total</td>
                      <td />
                      <td className="py-2 text-right pr-1">{formatTZS(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map((m) => {
                    const disabled = m.value === 'CARRIED_CREDIT' && credits.length === 0
                    return (
                      <button key={m.value} type="button" disabled={disabled}
                        onClick={() => setMethod(m.value)}
                        className={`border rounded-xl p-2.5 text-sm text-center transition-colors ${
                          disabled ? 'opacity-40 cursor-not-allowed border-gray-200'
                            : method === m.value ? 'border-primary bg-primary/5 font-medium'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {method === 'CARRIED_CREDIT' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Draw from credit</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={creditId} onChange={(e) => setCreditId(e.target.value)}>
                    <option value="">Select credit…</option>
                    {credits.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatTZS(c.remaining_amount)} — {c.source_display}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {method !== 'CARRIED_CREDIT' && method !== 'CASH' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Reference / Transaction ID</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={txnId} onChange={(e) => setTxnId(e.target.value)} />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                  value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
              <button type="button" onClick={onClose} disabled={submitting}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={submit} disabled={submitting || total <= 0}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-secondary disabled:opacity-60">
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? 'Processing…' : `Record ${formatTZS(total)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
