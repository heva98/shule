// Test-only helpers for the analytics page: fake /api/analytics/query/
// responses and a pivot built from them.
import { buildPivot } from './pivot'
import { DEFAULT_OPTIONS } from './visualizationConfig'

/**
 * A query response in the API's shape.
 *
 * @param dims   { dimId: [itemIds] } in response column order
 * @param value  (itemsByDim) => number | null | { value, suppressed }; null
 *               leaves the cell out of the response
 * @param units  { metricId: unit } for dx items (default 'count')
 */
export function makeResponse(dims, value, units = {}) {
  const ids = Object.keys(dims)
  let combos = [{}]
  for (const id of ids) combos = combos.flatMap((c) => dims[id].map((item) => ({ ...c, [id]: item })))
  const rows = []
  for (const combo of combos) {
    const v = value(combo)
    if (v === null || v === undefined) continue
    const cell = typeof v === 'object' ? v : { value: v, suppressed: false }
    rows.push([...ids.map((id) => combo[id]), cell.suppressed ? null : cell.value, Boolean(cell.suppressed)])
  }
  return {
    headers: [...ids.map((id) => ({ name: id, column: id, meta: true })), { name: 'value' }, { name: 'suppressed' }],
    rows,
    metaData: {
      dimensions: dims,
      items: {
        dx: { name: 'Data', items: Object.fromEntries((dims.dx ?? []).map((m) => [m, { name: m, unit: units[m] ?? 'count' }])) },
      },
      warnings: [],
    },
  }
}

// Labels items as `dim:item`, so tests can see which dimension named them.
export const testLabel = (dimId, itemId) => `${dimId}:${itemId}`

export function makePivot(dims, value, layout, { units, options } = {}) {
  return buildPivot(makeResponse(dims, value, units), layout, { ...DEFAULT_OPTIONS, ...options }, testLabel)
}
