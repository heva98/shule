function Pulse({ className }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

function CardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <Pulse className="h-3 w-24" />
      <Pulse className="h-7 w-36" />
      <Pulse className="h-3 w-20" />
    </div>
  )
}

function StatSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Pulse className="h-3 w-24" />
          <Pulse className="h-8 w-28 mt-1" />
          <Pulse className="h-3 w-16" />
        </div>
        <Pulse className="w-11 h-11 rounded-xl shrink-0 ml-3" />
      </div>
    </div>
  )
}

// Deterministic widths — avoid re-randomising on every render
const ROW_WIDTHS = [72, 55, 80, 60, 75, 50, 68, 83]

export function TableRowSkeleton({ cols = 4 }) {
  return (
    <tr>
      {[...Array(cols)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Pulse className={`h-4`} style={{ width: `${ROW_WIDTHS[i % ROW_WIDTHS.length]}%` }} />
        </td>
      ))}
    </tr>
  )
}

/**
 * Variants:
 *   stat       — icon + number card (grid of `count`)
 *   table-row  — skeleton table rows (rendered as <tr> elements)
 *   card       — text block card (default)
 */
export default function LoadingSkeleton({ variant = 'card', count = 1, cols = 4 }) {
  const items = [...Array(count)]

  if (variant === 'stat') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {items.map((_, i) => <StatSkeleton key={i} />)}
      </div>
    )
  }

  if (variant === 'table-row') {
    return <>{items.map((_, i) => <TableRowSkeleton key={i} cols={cols} />)}</>
  }

  return (
    <div className="space-y-3">
      {items.map((_, i) => <CardSkeleton key={i} />)}
    </div>
  )
}

export { CardSkeleton, StatSkeleton }
