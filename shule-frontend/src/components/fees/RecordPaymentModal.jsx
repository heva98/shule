import { Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { getReceipt, recordPayment } from '../../api/fees'
import { formatTZS } from '../../lib/format'
import ReceiptView from './ReceiptView'

const inputCls = `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

export default function RecordPaymentModal({ invoice, onClose, onSuccess }) {
  const [receipt, setReceipt] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      amount: '',
      payment_method: 'CASH',
      transaction_id: '',
      notes: '',
    },
  })

  const method = watch('payment_method')
  const balance = Number(invoice.balance ?? 0)

  async function onSubmit(data) {
    setSubmitting(true)
    try {
      const payment = await recordPayment({
        invoice: invoice.id,
        amount: data.amount,
        payment_method: data.payment_method,
        transaction_id: data.transaction_id?.trim() || '',
        notes: data.notes?.trim() || '',
        paid_at: new Date().toISOString(),
      })
      const rcpt = await getReceipt(payment.id)
      setReceipt(rcpt)
      onSuccess?.()
    } catch (err) {
      const detail = err.response?.data
      if (detail && typeof detail === 'object') {
        const first = Object.values(detail)[0]
        toast.error(Array.isArray(first) ? first[0] : String(first))
      } else {
        toast.error('Payment failed. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[95vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {receipt ? (
          <ReceiptView receipt={receipt} onClose={onClose} />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="font-semibold text-gray-900">Record Payment</h2>
                <p className="text-xs text-gray-400 mt-0.5">{invoice.student_name}</p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Invoice summary */}
            <div className="mx-6 mt-4 rounded-xl bg-gray-50 border border-gray-100 p-4 shrink-0">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-gray-400">Invoiced</p>
                  <p className="text-sm font-semibold text-gray-700 mt-0.5">
                    {formatTZS(invoice.amount_due)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Paid</p>
                  <p className="text-sm font-semibold text-success mt-0.5">
                    {formatTZS(invoice.amount_paid)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Balance</p>
                  <p className="text-sm font-semibold text-danger mt-0.5">
                    {formatTZS(balance)}
                  </p>
                </div>
              </div>
              <div className="text-center mt-2 text-xs text-gray-400">
                {invoice.academic_year_label} · {invoice.term?.replace('TERM', 'Term ')} · {invoice.student_id_display}
              </div>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
            >
              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Amount (TZS) <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-mono">
                    TZS
                  </span>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    {...register('amount', {
                      required: 'Amount is required',
                      min: { value: 1, message: 'Amount must be greater than 0' },
                    })}
                    className={`${inputCls} pl-12`}
                    placeholder="0"
                  />
                </div>
                {errors.amount && (
                  <p className="mt-1 text-xs text-danger">{errors.amount.message}</p>
                )}
              </div>

              {/* Payment method */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Payment Method <span className="text-danger">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'CASH', label: 'Cash', enabled: true },
                    { value: 'BANK_TRANSFER', label: 'Bank Transfer', enabled: true },
                    { value: 'MPESA', label: 'M-Pesa', enabled: false },
                  ].map(({ value, label, enabled }) => (
                    <label
                      key={value}
                      className={`relative flex flex-col items-center gap-1 border rounded-xl p-3 cursor-pointer
                        transition-colors text-center ${
                        !enabled
                          ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50'
                          : method === value
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        {...register('payment_method', { required: true })}
                        value={value}
                        disabled={!enabled}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium text-gray-800">{label}</span>
                      {!enabled && (
                        <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">
                          Soon
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {/* Transaction ID — shown for non-cash */}
              {method !== 'CASH' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Transaction / Reference ID
                  </label>
                  <input
                    {...register('transaction_id')}
                    className={inputCls}
                    placeholder="Bank reference or receipt number"
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  {...register('notes')}
                  rows={2}
                  className={`${inputCls} resize-none`}
                  placeholder="Optional remarks"
                />
              </div>
            </form>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600
                  hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit(onSubmit)}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg
                  text-sm font-medium hover:bg-secondary disabled:opacity-60 transition-colors"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? 'Processing…' : 'Record Payment'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
