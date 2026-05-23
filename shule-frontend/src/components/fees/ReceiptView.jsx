import { CheckCircle, Printer, X } from 'lucide-react'
import { formatTZS } from '../../lib/format'

export default function ReceiptView({ receipt, onClose }) {
  const inv = receipt.invoice_detail

  function handlePrint() {
    const content = document.getElementById('receipt-printable').innerHTML
    const w = window.open('', '_blank', 'width=620,height=780')
    w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${receipt.receipt_number}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; padding: 32px; color: #111; }
    .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #1B4F72; padding-bottom: 16px; }
    .school-name { font-size: 22px; font-weight: 700; color: #1B4F72; }
    .school-sub { font-size: 13px; color: #666; margin-top: 2px; }
    .receipt-badge { display: inline-block; margin-top: 10px; background: #f0f7ff; color: #1B4F72;
      font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px; letter-spacing: .5px; }
    .section { margin: 20px 0; }
    .row { display: flex; justify-content: space-between; padding: 6px 0;
      border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    .row .label { color: #666; }
    .row .value { font-weight: 500; }
    .amount-block { text-align: center; margin: 28px 0; padding: 20px;
      background: #f8fffe; border: 2px solid #27AE60; border-radius: 12px; }
    .amount-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    .amount-value { font-size: 32px; font-weight: 800; color: #27AE60; margin: 6px 0; }
    .balance { font-size: 14px; color: #E74C3C; font-weight: 500; margin-top: 4px; }
    .footer { margin-top: 32px; border-top: 1px dashed #ccc; padding-top: 16px;
      font-size: 12px; color: #888; text-align: center; }
    .sig-line { display: flex; justify-content: space-between; margin-top: 40px; font-size: 12px; }
    .sig-line div { text-align: center; width: 45%; border-top: 1px solid #ccc; padding-top: 6px; }
  </style>
</head>
<body>${content}</body>
</html>`)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
  }

  const balance = Number(inv?.balance ?? 0)

  return (
    <div className="flex flex-col max-h-[90vh]">
      {/* Modal header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2 text-success">
          <CheckCircle size={20} />
          <span className="font-semibold text-gray-900">Payment Recorded</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Printable receipt content */}
      <div className="overflow-y-auto flex-1 p-6">
        <div id="receipt-printable">
          <div className="header">
            <div className="school-name">Shule School</div>
            <div className="school-sub">P.O. Box 1234, Dar es Salaam, Tanzania</div>
            <div className="receipt-badge">OFFICIAL RECEIPT</div>
          </div>

          <div className="amount-block">
            <div className="amount-label">Amount Paid</div>
            <div className="amount-value">{formatTZS(receipt.amount)}</div>
            {balance > 0 && (
              <div className="balance">Outstanding balance: {formatTZS(balance)}</div>
            )}
            {balance <= 0 && (
              <div style={{ fontSize: 13, color: '#27AE60', marginTop: 4, fontWeight: 600 }}>
                ✓ Fully paid
              </div>
            )}
          </div>

          <div className="section">
            <div className="row">
              <span className="label">Receipt No.</span>
              <span className="value" style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                {receipt.receipt_number}
              </span>
            </div>
            <div className="row">
              <span className="label">Date</span>
              <span className="value">
                {new Date(receipt.paid_at).toLocaleString('en-TZ', {
                  dateStyle: 'medium', timeStyle: 'short',
                })}
              </span>
            </div>
            <div className="row">
              <span className="label">Student</span>
              <span className="value">{inv?.student_name}</span>
            </div>
            <div className="row">
              <span className="label">Student ID</span>
              <span className="value" style={{ fontFamily: 'monospace' }}>
                {inv?.student_id_display}
              </span>
            </div>
            <div className="row">
              <span className="label">Term</span>
              <span className="value">
                {inv?.academic_year_label} · {inv?.term?.replace('TERM', 'Term ')}
              </span>
            </div>
            <div className="row">
              <span className="label">Total Invoiced</span>
              <span className="value">{formatTZS(inv?.amount_due)}</span>
            </div>
            <div className="row">
              <span className="label">Total Paid (inc. this)</span>
              <span className="value">{formatTZS(inv?.amount_paid)}</span>
            </div>
            <div className="row">
              <span className="label">Payment Method</span>
              <span className="value">{receipt.payment_method?.replace('_', ' ')}</span>
            </div>
            {receipt.transaction_id && (
              <div className="row">
                <span className="label">Transaction ID</span>
                <span className="value" style={{ fontFamily: 'monospace' }}>
                  {receipt.transaction_id}
                </span>
              </div>
            )}
            <div className="row">
              <span className="label">Received by</span>
              <span className="value">{receipt.received_by_name}</span>
            </div>
            {receipt.notes && (
              <div className="row">
                <span className="label">Notes</span>
                <span className="value">{receipt.notes}</span>
              </div>
            )}
          </div>

          <div className="sig-line">
            <div>Cashier Signature</div>
            <div>Parent / Guardian Signature</div>
          </div>

          <div className="footer">
            This is an official receipt. Please retain for your records.
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg
            text-sm font-medium hover:bg-secondary transition-colors"
        >
          <Printer size={15} />
          Print Receipt
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600
            hover:bg-gray-50 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}
