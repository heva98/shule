import { Calendar, Database, GripVertical, Layers, School, Search } from 'lucide-react'
import { useState } from 'react'
import { inputCls } from '../../../lib/formStyles'
import { DIM_MIME, axisLabels, axisOf } from '../visualizationConfig'

const FIXED_ICONS = { dx: Database, pe: Calendar, ou: School }

const AXIS_DOT = {
  columns: 'bg-primary',
  rows: 'bg-purple',
  filters: 'bg-accent',
}

function DimensionRow({ dim, label, config, notApplicable, onOpen }) {
  const Icon = FIXED_ICONS[dim.id] ?? Layers
  const axis = axisOf(config, dim.id)
  const count = config.items[dim.id]?.length ?? 0
  return (
    <li>
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DIM_MIME, dim.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onClick={() => onOpen(dim.id)}
        title={notApplicable ?? undefined}
        className={`group w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm hover:bg-gray-100 cursor-grab active:cursor-grabbing ${notApplicable ? 'text-gray-400' : 'text-gray-700'}`}
      >
        <GripVertical size={14} className="text-gray-300 opacity-0 group-hover:opacity-100 shrink-0 hidden lg:block" />
        <Icon size={15} className="shrink-0 text-gray-400" />
        <span className="flex-1 min-w-0 truncate">{label}</span>
        {count > 0 && <span className="text-xs text-gray-400 tabular-nums">{count}</span>}
        {axis && (
          <span className={`w-2 h-2 rounded-full shrink-0 ${AXIS_DOT[axis]}`} title={`In ${axisLabels(config.type)[axis]}`} />
        )}
      </button>
    </li>
  )
}

export default function DimensionPanel({ dimensions, config, dimensionLabel, notApplicable, onOpen }) {
  const [search, setSearch] = useState('')
  const fixed = dimensions.filter((d) => ['dx', 'pe', 'ou'].includes(d.id))
  const q = search.trim().toLowerCase()
  const dynamic = dimensions
    .filter((d) => !['dx', 'pe', 'ou'].includes(d.id))
    .filter((d) => !q || d.label.toLowerCase().includes(q))

  const row = (dim) => (
    <DimensionRow key={dim.id} dim={dim} label={dimensionLabel(dim.id)} config={config}
      notApplicable={notApplicable(dim)} onOpen={onOpen} />
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-3 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Main dimensions</h2>
        <ul className="space-y-0.5">{fixed.map(row)}</ul>
      </div>
      <div className="px-3 pt-2 border-t border-gray-100 flex flex-col min-h-0 flex-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Other dimensions</h2>
        <div className="relative mb-2">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter dimensions"
            className={`${inputCls} w-full pl-8 py-1.5 text-xs`} />
        </div>
        <ul className="space-y-0.5 overflow-y-auto pb-3 flex-1 min-h-0">
          {dynamic.length === 0 && <li className="px-2 py-1 text-xs text-gray-400">No dimensions.</li>}
          {dynamic.map(row)}
        </ul>
      </div>
      <p className="px-3 py-2 border-t border-gray-100 text-[11px] text-gray-400 hidden lg:block">
        Click a dimension to choose items, or drag it onto the layout.
      </p>
    </div>
  )
}
