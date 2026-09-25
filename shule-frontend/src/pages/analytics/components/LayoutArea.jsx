import { MoreVertical } from 'lucide-react'
import { useState } from 'react'
import { AXES, DIM_MIME, axisLabels, placementError } from '../visualizationConfig'

const CHIP_CLS = {
  columns: 'bg-blue-50 border-blue-200 text-blue-800',
  rows: 'bg-violet-50 border-violet-200 text-violet-800',
  filters: 'bg-amber-50 border-amber-200 text-amber-800',
}

function Chip({ dimId, axis, axisNames, index, label, count, emptyWarning, menuOpen, onMenu, onOpen, onDropAt, onMove, onRemove, canMoveTo }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DIM_MIME, dimId)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        // Dropping onto a chip inserts before it.
        e.preventDefault()
        e.stopPropagation()
        onDropAt(e.dataTransfer.getData(DIM_MIME), axis, index)
      }}
      className={`relative inline-flex items-center rounded-md border text-xs font-medium cursor-grab active:cursor-grabbing ${CHIP_CLS[axis]} ${emptyWarning ? 'ring-1 ring-danger/60' : ''}`}
    >
      <button type="button" onClick={() => onOpen(dimId)} className="pl-2 pr-1 py-1 max-w-[12rem] truncate"
        title={emptyWarning ? 'Nothing selected' : `${label}: ${count || 'all'} selected`}>
        {label}
        <span className="ml-1 opacity-60 tabular-nums">{count > 0 ? count : emptyWarning ? '0' : 'all'}</span>
      </button>
      <button type="button" onClick={() => onMenu(menuOpen ? null : dimId)} aria-label={`${label} options`}
        className="px-1 py-1 rounded-r-md hover:bg-black/5">
        <MoreVertical size={13} />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => onMenu(null)} />
          <div className="absolute left-0 top-full mt-1 z-30 w-40 rounded-lg border border-gray-200 bg-white shadow-card py-1 text-gray-700">
            {AXES.filter((a) => a !== axis && canMoveTo(a)).map((a) => (
              <button key={a} type="button" onClick={() => onMove(dimId, a)}
                className="block w-full text-left px-3 py-1.5 hover:bg-gray-50">
                Move to {axisNames[a]}
              </button>
            ))}
            <button type="button" onClick={() => onRemove(dimId)}
              className="block w-full text-left px-3 py-1.5 text-danger hover:bg-red-50">
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Columns / Rows / Filter drop zones. Chips can be dragged between zones (or
 * in from the dimension panel); the ⋮ menu offers the same moves for touch
 * screens, where HTML drag and drop isn't available.
 */
export default function LayoutArea({ config, dimensionsById, dimensionLabel, onOpen, onPlace, onRemove }) {
  const [menu, setMenu] = useState(null)
  const [over, setOver] = useState(null)
  const axisNames = axisLabels(config.type)

  const drop = (dimId, axis, index) => {
    setOver(null)
    if (dimId) onPlace(dimId, axis, index)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] xl:grid-cols-3 gap-2">
      {AXES.map((axis) => (
        <div
          key={axis}
          onDragOver={(e) => {
            e.preventDefault()
            if (over !== axis) setOver(axis)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setOver(null)
          }}
          onDrop={(e) => {
            e.preventDefault()
            drop(e.dataTransfer.getData(DIM_MIME), axis)
          }}
          className={`flex items-start gap-2 min-h-[2.75rem] rounded-lg border border-dashed px-2 py-1.5 transition-colors ${
            axis === 'filters' ? 'md:col-span-2 xl:col-span-1' : ''
          } ${over === axis ? 'border-primary bg-blue-50/60' : 'border-gray-300 bg-white'}`}
        >
          <span className="w-14 shrink-0 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {axisNames[axis]}
          </span>
          <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
            {config[axis].length === 0 && (
              <span className="py-1 text-xs text-gray-300">Drop a dimension here</span>
            )}
            {config[axis].map((dimId, index) => {
              const count = config.items[dimId]?.length ?? 0
              const required = ['dx', 'pe'].includes(dimId) || (dimId === 'ou' && axis !== 'filters')
              return (
                <Chip
                  key={dimId}
                  dimId={dimId}
                  axis={axis}
                  axisNames={axisNames}
                  index={index}
                  label={dimensionLabel(dimId)}
                  count={count}
                  emptyWarning={count === 0 && required}
                  menuOpen={menu === dimId}
                  onMenu={setMenu}
                  onOpen={onOpen}
                  onDropAt={drop}
                  onMove={(id, a) => {
                    setMenu(null)
                    onPlace(id, a)
                  }}
                  onRemove={(id) => {
                    setMenu(null)
                    onRemove(id)
                  }}
                  canMoveTo={(a) => !placementError(dimensionsById[dimId], a)}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
