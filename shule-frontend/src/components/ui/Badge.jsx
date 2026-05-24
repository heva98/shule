const STATUS_COLORS = {
  // Student
  ACTIVE:      'bg-emerald-100 text-emerald-700',
  SUSPENDED:   'bg-yellow-100 text-yellow-700',
  EXPELLED:    'bg-red-100 text-red-700',
  TRANSFERRED: 'bg-blue-100 text-blue-700',
  GRADUATED:   'bg-purple-100 text-purple-700',
  // Fees / Invoice
  PAID:        'bg-emerald-100 text-emerald-700',
  PARTIAL:     'bg-amber-100 text-amber-700',
  UNPAID:      'bg-red-100 text-red-700',
  OVERDUE:     'bg-red-200 text-red-800',
  // Attendance
  PRESENT:     'bg-emerald-100 text-emerald-700',
  ABSENT:      'bg-red-100 text-red-700',
  LATE:        'bg-orange-100 text-orange-700',
  EXCUSED:     'bg-blue-100 text-blue-700',
  // Leave / approval
  PENDING:     'bg-amber-100 text-amber-700',
  APPROVED:    'bg-emerald-100 text-emerald-700',
  REJECTED:    'bg-red-100 text-red-700',
}

const STATUS_LABELS = {
  ACTIVE: 'Active', SUSPENDED: 'Suspended', EXPELLED: 'Expelled',
  TRANSFERRED: 'Transferred', GRADUATED: 'Graduated',
  PAID: 'Paid', PARTIAL: 'Partial', UNPAID: 'Unpaid', OVERDUE: 'Overdue',
  PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late', EXCUSED: 'Excused',
  PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected',
}

/**
 * Usage:
 *   <Badge status="ACTIVE" />                    — auto label + color
 *   <Badge status="PAID" label="Cleared" />      — custom label, auto color
 *   <Badge label="Custom" colorClass="bg-..." /> — fully manual (legacy)
 */
export default function Badge({ label, colorClass, status }) {
  const resolvedLabel = label ?? STATUS_LABELS[status] ?? status ?? ''
  const resolvedColor = colorClass ?? STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${resolvedColor}`}>
      {resolvedLabel}
    </span>
  )
}
