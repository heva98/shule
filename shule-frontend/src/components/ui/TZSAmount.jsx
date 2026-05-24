/**
 * Renders a TZS currency amount with semantic colour:
 *   negative  → red   (debt / overdue)
 *   zero      → green (cleared / no balance)
 *   positive  → dark  (normal amount)
 */
export default function TZSAmount({ amount, className = '' }) {
  const num = Number(amount ?? 0)
  const abs = Math.abs(num).toLocaleString('en-US')

  let colorCls = 'text-gray-900'
  if (num < 0) colorCls = 'text-red-600'
  else if (num === 0) colorCls = 'text-emerald-600'

  return (
    <span className={`font-medium tabular-nums ${colorCls} ${className}`}>
      {num < 0 && '−'}TZS {abs}
    </span>
  )
}
