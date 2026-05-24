import { useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import EmptyState from './EmptyState'

const COL_WIDTHS = [70, 55, 80, 60, 75, 50, 65, 70]

export default function DataTable({
  columns = [],
  data,
  loading = false,
  onRowClick,
  emptyIcon,
  emptyTitle = 'No data',
  emptyMessage,
  loadingRows = 5,
}) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = [...(data ?? [])].sort((a, b) => {
    if (!sortKey) return 0
    const va = a[sortKey] ?? ''
    const vb = b[sortKey] ?? ''
    const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true })
    return sortDir === 'asc' ? cmp : -cmp
  })

  const thCls =
    'text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider'

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={`${thCls} ${col.sortable ? 'cursor-pointer select-none hover:text-gray-700' : ''} ${col.className ?? ''}`}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && (
                    sortKey === col.key ? (
                      sortDir === 'asc'
                        ? <ChevronUp size={12} />
                        : <ChevronDown size={12} />
                    ) : (
                      <ChevronsUpDown size={12} className="text-gray-300" />
                    )
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading ? (
            [...Array(loadingRows)].map((_, ri) => (
              <tr key={ri}>
                {columns.map((col, ci) => (
                  <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                    <div
                      className="h-4 bg-gray-200 rounded animate-pulse"
                      style={{ width: `${COL_WIDTHS[(ri + ci) % COL_WIDTHS.length]}%` }}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState
                  icon={emptyIcon}
                  title={emptyTitle}
                  message={emptyMessage}
                />
              </td>
            </tr>
          ) : (
            sorted.map((row, ri) => (
              <tr
                key={row.id ?? ri}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`hover:bg-gray-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
