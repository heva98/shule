import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../../lib/axios'
import { formatTZS } from '../../lib/format'
import ReceiptView from './ReceiptView'
import StudentPicker from './StudentPicker'

const cell = `border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

const blankItem = () => ({ name: '', qty: 1, unit_price: '' })

export default function UniformSaleModal({ student: initialStudent, onClose, onSuccess }) {
  const [student, setStudent] = useState(initialStudent || null)
  const [items, setItems] = useState([blankItem()])
  const [mode, setMode] = useState('CASH') // CASH | BANK_TRANSFER | LATER
  const [txnId, setTxnId] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState(null)

  const total = useMemo(
    () => items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0),
    [items],
  )

  function setItem(i, patch) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  async function submit() {
    if (!student) return toast.error('Choose a student.')
    const clean = items
      .map((it) => ({ name: it.name.trim(), qty: Number(it.qty), unit_price: Number(it.unit_price) }))
      .filter((it) => it.name && it.qty > 0 && it.unit_price >= 0)
    if (clean.length === 0) return toast.error('Add at least one item.')
    if (total <= 0) return toast.error('Total must be greater than zero.')

    setSubmitting(true)
    try {
      const payload = { student: student.id, items: clean, notes: notes.trim() }
      if (mode !== 'LATER') {
        payload.payment = { payment_method: mode, transaction_id: mode === 'CASH' ? '' : txnId.trim() }
      }
      const { data } = await api.post('/fees/uniform-sales/', payload)
      if (data.receipt) {
        setReceipt(data.receipt)
      } else {
        toast.success('Sale recorded (unpaid)')
        onClose()
      }
      onSuccess?.()
    } catch (err) {
      const d = err.response?.data
      const msg = typeof d === 'object' && d
        ? (Array.isArray(Object.values(d)[0]) ? Object.values(d)[0][0] : String(Object.values(d)[0]))
        : 'Could not record the sale.'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[95vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        {receipt ? (
          <ReceiptView receipt={receipt} onClose={onClose} />
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="font-semibold text-gray-900">Uniform Sale</h2>
              <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {student ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-gray-800">{student.full_name}</span>
                  <span className="text-xs text-gray-400 font-mono">{student.student_id}</span>
                  <button className="text-xs text-primary hover:underline ml-2" onClick={() => setStudent(null)}>
                    change
                  </button>
                </div>
              ) : (
                <StudentPicker onPick={setStudent} />
              )}

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left py-2">Item</th>
                    <th className="text-right py-2 w-16">Qty</th>
                    <th className="text-right py-2 w-32">Unit price</th>
                    <th className="text-right py-2 w-32">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-2">
                        <input className={cell + ' w-full'} value={it.name}
                          onChange={(e) => setItem(i, { name: e.target.value })} placeholder="e.g. Shirt" />
                      </td>
                      <td className="py-1">
                        <input type="number" min="1" className={cell + ' w-full text-right'} value={it.qty}
                          onChange={(e) => setItem(i, { qty: e.target.value })} />
                      </td>
                      <td className="py-1 pl-2">
                        <input type="number" min="0" className={cell + ' w-full text-right'} value={it.unit_price}
                          onChange={(e) => setItem(i, { unit_price: e.target.value })} placeholder="0" />
                      </td>
                      <td className="py-1 text-right font-mono pr-1">
                        {formatTZS((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}
                      </td>
                      <td className="py-1 text-right">
                        {items.length > 1 && (
                          <button onClick={() => setItems((a) => a.filter((_, idx) => idx !== i))}
                            className="p-1 text-gray-400 hover:text-danger">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="pt-1">
                      <button onClick={() => setItems((a) => [...a, blankItem()])}
                        className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <Plus size={13} /> Add item
                      </button>
                    </td>
                  </tr>
                  <tr className="border-t-2 border-gray-100 font-semibold">
                    <td className="py-2" colSpan={3}>Total</td>
                    <td className="py-2 text-right pr-1">{formatTZS(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Payment</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: 'CASH', l: 'Cash' },
                    { v: 'BANK_TRANSFER', l: 'Bank Transfer' },
                    { v: 'LATER', l: 'Invoice only' },
                  ].map(({ v, l }) => (
                    <button key={v} type="button" onClick={() => setMode(v)}
                      className={`border rounded-xl p-2.5 text-sm text-center transition-colors ${
                        mode === v ? 'border-primary bg-primary/5 font-medium' : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'BANK_TRANSFER' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Reference / Transaction ID</label>
                  <input className={cell + ' w-full'} value={txnId} onChange={(e) => setTxnId(e.target.value)} />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea rows={2} className={cell + ' w-full resize-none'} value={notes}
                  onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
              <button type="button" onClick={onClose} disabled={submitting}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={submit} disabled={submitting || total <= 0 || !student}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-secondary disabled:opacity-60">
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {mode === 'LATER' ? 'Record Sale' : `Record & Receipt · ${formatTZS(total)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
