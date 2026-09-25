import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Pin, Search, Users } from 'lucide-react'
import { useState } from 'react'
import { listVisualizations } from '../../../api/analytics'
import Modal from '../../../components/ui/Modal'
import { inputCls } from '../../../lib/formStyles'
import { VISUALIZATIONS_KEY, unavailableMessage } from '../savedVisualizations'
import { VISUALIZATION_TYPES } from '../visualizationConfig'

const TYPE_LABELS = Object.fromEntries(VISUALIZATION_TYPES.map((t) => [t.id, t.label]))

export default function OpenVisualizationModal({ currentId, onOpen, onClose }) {
  const [search, setSearch] = useState('')
  const list = useQuery({ queryKey: VISUALIZATIONS_KEY, queryFn: () => listVisualizations() })

  const needle = search.trim().toLowerCase()
  const rows = (list.data ?? []).filter((v) => !needle || v.name.toLowerCase().includes(needle))

  let body
  if (list.isLoading) {
    body = <p className="px-6 py-8 text-sm text-gray-500 text-center">Loading…</p>
  } else if (list.isError) {
    body = <p className="px-6 py-8 text-sm text-danger text-center">Saved visualizations could not be loaded.</p>
  } else if (!rows.length) {
    body = (
      <p className="px-6 py-8 text-sm text-gray-500 text-center">
        {list.data.length ? 'No visualization matches that name.' : 'Nothing saved yet. Build a visualization and choose File → Save.'}
      </p>
    )
  } else {
    body = (
      <ul className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
        {rows.map((v) => {
          const problem = unavailableMessage(v.unavailable)
          return (
            <li key={v.id}>
              <button type="button" onClick={() => onOpen(v)}
                className={`w-full text-left px-6 py-3 hover:bg-gray-50 ${v.id === currentId ? 'bg-primary/5' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-800 truncate">{v.name}</span>
                  {v.is_pinned && <Pin size={12} className="text-gray-400 shrink-0" aria-label="Pinned to dashboard" />}
                  {v.shared_with_staff && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 shrink-0">
                      <Users size={12} /> Shared
                    </span>
                  )}
                  <span className="ml-auto text-xs text-gray-400 shrink-0">{TYPE_LABELS[v.type] ?? v.type}</span>
                </div>
                {v.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{v.description}</p>}
                {!v.is_owner && <p className="text-xs text-gray-400 mt-0.5">By {v.created_by_name}</p>}
                {problem && (
                  <p className="flex items-start gap-1 text-xs text-amber-700 mt-1">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {problem}
                  </p>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <Modal isOpen onClose={onClose} title="Open visualization" size="md">
      <div className="px-6 pt-4 pb-3 border-b border-gray-100">
        <label className="relative block">
          <span className="sr-only">Search by name</span>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name"
            className={`${inputCls} w-full pl-8`} />
        </label>
      </div>
      {body}
    </Modal>
  )
}
