import { CheckCircle, Printer, RotateCcw, X } from 'lucide-react'
import { formatTZS } from '../../lib/format'

const PRINT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; padding: 32px; color: #111; }
  .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #1B4F72; padding-bottom: 16px; }
  .school-name { font-size: 22px; font-weight: 700; color: #1B4F72; }
  .school-sub { font-size: 13px; color: #666; margin-top: 2px; }
  .receipt-badge { display: inline-block; margin-top: 10px; background: #f0f7ff; color: #1B4F72;
    font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px; letter-spacing: .5px; }
  .reversed-badge { background: #fdecea; color: #c0392b; }
  .section { margin: 20px 0; }
  .row { display: flex; justify-content: space-between; padding: 6px 0;
    border-bottom: 1px solid #f0f0f0; font-size: 14px; }
  .row .label { color: #666; }
  .row .value { font-weight: 500; }
  .amount-block { text-align: center; margin: 28px 0; padding: 20px;
    background: #f8fffe; border: 2px solid #27AE60; border-radius: 12px; }
  .amount-block.reversed { background: #fdf3f2; border-color: #c0392b; }
  .amount-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
  .amount-value { font-size: 32px; font-weight: 800; color: #27AE60; margin: 6px 0; }
  .amount-block.reversed .amount-value { color: #c0392b; }
  .breakdown { width: 100%; border-collapse: collapse; margin: 8px 0 4px; font-size: 14px; }
  .breakdown th, .breakdown td { text-align: left; padding: 7px 0; border-bottom: 1px solid #f0f0f0; }
  .breakdown td.amt, .breakdown th.amt { text-align: right; }
  .breakdown tfoot td { font-weight: 700; border-top: 2px solid #e0e0e0; border-bottom: none; }
  .footer { margin-top: 32px; border-top: 1px dashed #ccc; padding-top: 16px;
    font-size: 12px; color: #888; text-align: center; }
  .sig-line { display: flex; justify-content: space-between; margin-top: 40px; font-size: 12px; }
  .sig-line div { text-align: center; width: 45%; border-top: 1px solid #ccc; padding-top: 6px; }
`

export default function ReceiptView({ receipt, onClose, onReverse }) {
  const inv = receipt.invoice_detail
  const reversed = receipt.status === 'REVERSED'
  const allocations = receipt.allocations ?? []
  const studentName = receipt.student_name ?? inv?.student_name
  const studentId = receipt.student_id_display ?? inv?.student_id_display

  function handlePrint() {
    const content = document.getElementById('receipt-printable').innerHTML
    const w = window.open('', '_blank', 'width=620,height=780')
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8" />` +
      `<title>Receipt ${receipt.receipt_number}</title><style>${PRINT_CSS}</style></head>` +
      `<body>${content}</body></html>`,
    )
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
  }

  return (
    <div className="flex flex-col max-h-[90vh]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className={`flex items-center gap-2 ${reversed ? 'text-danger' : 'text-success'}`}>
          <CheckCircle size={20} />
          <span className="font-semibold text-gray-900">
            {reversed ? 'Payment Reversed' : 'Payment Recorded'}
          </span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-6">
        <div id="receipt-printable">
          <div className="header">
            <div className="school-name">Shule School</div>
            <div className="school-sub">P.O. Box 1234, Dar es Salaam, Tanzania</div>
            <div className={`receipt-badge ${reversed ? 'reversed-badge' : ''}`}>
              {reversed ? 'REVERSED — NOT VALID' : 'OFFICIAL RECEIPT'}
            </div>
          </div>

          <div className={`amount-block ${reversed ? 'reversed' : ''}`}>
            <div className="amount-label">{reversed ? 'Amount Reversed' : 'Amount Paid'}</div>
            <div className="amount-value">{formatTZS(receipt.amount)}</div>
            {receipt.from_credit && (
              <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Applied from carried credit</div>
            )}
          </div>

          {allocations.length > 0 && (
            <table className="breakdown">
              <thead>
                <tr><th>Payment Type</th><th className="amt">Amount</th></tr>
              </thead>
              <tbody>
                {allocations.map((a) => (
                  <tr key={a.id}>
                    <td>{a.category_display}</td>
                    <td className="amt">{formatTZS(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>Total</td><td className="amt">{formatTZS(receipt.amount)}</td></tr>
              </tfoot>
            </table>
          )}

          <div className="section">
            <div className="row">
              <span className="label">Receipt No.</span>
              <span className="value" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{receipt.receipt_number}</span>
            </div>
            <div className="row">
              <span className="label">Date</span>
              <span className="value">
                {new Date(receipt.paid_at).toLocaleString('en-TZ', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </div>
            <div className="row">
              <span className="label">Student</span>
              <span className="value">{studentName}</span>
            </div>
            {studentId && (
              <div className="row">
                <span className="label">Student ID</span>
                <span className="value" style={{ fontFamily: 'monospace' }}>{studentId}</span>
              </div>
            )}
            <div className="row">
              <span className="label">Payment Method</span>
              <span className="value">{receipt.payment_method?.replace(/_/g, ' ')}</span>
            </div>
            {receipt.transaction_id && (
              <div className="row">
                <span className="label">Transaction ID</span>
                <span className="value" style={{ fontFamily: 'monospace' }}>{receipt.transaction_id}</span>
              </div>
            )}
            <div className="row">
              <span className="label">Received by</span>
              <span className="value">{receipt.received_by_name}</span>
            </div>
            {receipt.notes && (
              <div className="row"><span className="label">Notes</span><span className="value">{receipt.notes}</span></div>
            )}
            {reversed && receipt.reversal_reason && (
              <div className="row">
                <span className="label">Reversal reason</span>
                <span className="value">{receipt.reversal_reason}</span>
              </div>
            )}
          </div>

          <div className="sig-line">
            <div>Cashier Signature</div>
            <div>Parent / Guardian Signature</div>
          </div>
          <div className="footer">This is an official receipt. Please retain for your records.</div>
        </div>
      </div>

      <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
        <button onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-secondary transition-colors">
          <Printer size={15} /> Print Receipt
        </button>
        {onReverse && !reversed && (
          <button onClick={onReverse}
            className="flex items-center gap-2 px-4 py-2 border border-danger/40 text-danger rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
            <RotateCcw size={15} /> Reverse
          </button>
        )}
        <button onClick={onClose}
          className="ml-auto px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          Close
        </button>
      </div>
    </div>
  )
}
