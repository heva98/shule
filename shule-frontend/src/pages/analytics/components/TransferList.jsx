import { Check, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { inputCls } from '../../../lib/formStyles'

/**
 * Two-pane item picker: available items (searchable, with "Select all") on
 * the left, the ordered selection on the right. `available` entries are
 * { id, label, depth?, description? }; `labelFor` names selected ids that
 * aren't in the current `available` list (another tab's periods, say).
 */
export default function TransferList({ available, selected, onChange, labelFor, header, emptyText = 'No items.' }) {
  const [search, setSearch] = useState('')
  const selectedSet = useMemo(() => new Set(selected), [selected])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return available
    return available.filter((i) => i.label.toLowerCase().includes(q) || i.id.toLowerCase().includes(q))
  }, [available, search])

  const toggle = (id) =>
    onChange(selectedSet.has(id) ? selected.filter((s) => s !== id) : [...selected, id])
  const selectAll = () =>
    onChange([...selected, ...filtered.map((i) => i.id).filter((id) => !selectedSet.has(id))])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="flex flex-col min-h-0">
        {header}
        <div className="relative mb-2">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className={`${inputCls} w-full pl-8`}
          />
        </div>
        <div className="flex items-center justify-between mb-1 text-xs text-gray-500">
          <span>{filtered.length} available</span>
          <button type="button" onClick={selectAll} disabled={!filtered.length}
            className="font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline">
            Select all
          </button>
        </div>
        <ul className="border border-gray-200 rounded-lg overflow-y-auto h-64 md:h-80 divide-y divide-gray-50">
          {filtered.length === 0 && <li className="p-3 text-sm text-gray-400">{emptyText}</li>}
          {filtered.map((item) => {
            const on = selectedSet.has(item.id)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  title={item.description || undefined}
                  className={`w-full flex items-start gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${on ? 'text-primary' : 'text-gray-700'}`}
                  style={{ paddingLeft: 12 + (search ? 0 : item.depth ?? 0) * 16 }}
                >
                  <span className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center ${on ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                    {on && <Check size={12} className="text-white" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block">{item.label}</span>
                    {item.description && <span className="block text-xs text-gray-400 truncate">{item.description}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-1 text-xs text-gray-500 md:mt-auto">
          <span className="font-medium">{selected.length} selected</span>
          <button type="button" onClick={() => onChange([])} disabled={!selected.length}
            className="font-medium text-danger hover:underline disabled:opacity-50 disabled:no-underline">
            Clear all
          </button>
        </div>
        <ul className="border border-gray-200 rounded-lg overflow-y-auto h-48 md:h-80 divide-y divide-gray-50 bg-gray-50/50">
          {selected.length === 0 && <li className="p-3 text-sm text-gray-400">Nothing selected.</li>}
          {selected.map((id) => (
            <li key={id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-gray-700">
              <span className="min-w-0 truncate">{labelFor(id)}</span>
              <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${labelFor(id)}`}
                className="p-0.5 rounded text-gray-400 hover:text-danger hover:bg-white">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
