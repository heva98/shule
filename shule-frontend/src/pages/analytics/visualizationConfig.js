// The analytics page keeps its whole state in one serialisable
// "visualization config" object, driven by `configReducer`, so a later phase
// can save and reload a visualization by storing this object as-is.
//
//   {
//     version: 1,
//     type: 'PIVOT_TABLE',
//     columns: ['dx'], rows: ['pe'], filters: ['ou'],   // layout: dimension ids
//     items:   { dx: [...], pe: [...], ou: [...] },     // selected item ids per dimension
//     options: { ... },                                 // display options
//   }

export const AXES = ['columns', 'rows', 'filters']

// dataTransfer type for dragging a dimension onto the layout.
export const DIM_MIME = 'application/x-shule-dimension'

export const AXIS_LABELS = {
  columns: 'Columns',
  rows: 'Rows',
  filters: 'Filter',
}

export const VISUALIZATION_TYPES = [
  { id: 'PIVOT_TABLE', label: 'Pivot table', available: true },
  { id: 'COLUMN', label: 'Column chart', available: false },
  { id: 'LINE', label: 'Line chart', available: false },
]

export const DEFAULT_OPTIONS = {
  showDimensionLabels: true,
  hideEmptyRows: false,
  hideEmptyColumns: false,
  decimals: 'auto', // 'auto' | 0 | 1 | 2
}

// The frontend's names for the three fixed dimensions (the API calls `ou`
// "Org unit"; staff know it as classes).
export const FIXED_DIMENSION_LABELS = { dx: 'Data', pe: 'Period', ou: 'Classes' }

export const initialConfig = {
  version: 1,
  type: 'PIVOT_TABLE',
  columns: ['dx'],
  rows: ['pe'],
  filters: ['ou'],
  items: { dx: [], pe: ['THIS_TERM'], ou: ['SCHOOL'] },
  options: DEFAULT_OPTIONS,
}

export function axisOf(config, dimId) {
  return AXES.find((axis) => config[axis].includes(dimId)) ?? null
}

// Why `dimId` can't go on `axis`, or null if it can.
export function placementError(dim, axis) {
  if (!dim) return null
  if (dim.id === 'dx' && axis === 'filters') return 'Data must be in Columns or Rows.'
  if (dim.filter_only && axis !== 'filters') return `${dim.label} can only be used as a filter.`
  return null
}

function withoutDim(config, dimId) {
  const out = { ...config }
  for (const axis of AXES) out[axis] = config[axis].filter((d) => d !== dimId)
  return out
}

export function configReducer(state, action) {
  switch (action.type) {
    case 'SET_TYPE':
      return { ...state, type: action.visType }

    case 'SET_ITEMS':
      return { ...state, items: { ...state.items, [action.dimId]: action.items } }

    // Put a dimension on an axis at `index` (end when omitted). Moving within
    // the same axis reorders it.
    case 'MOVE_DIMENSION': {
      const { dimId, axis } = action
      const next = withoutDim(state, dimId)
      const list = [...next[axis]]
      let index = action.index ?? list.length
      const from = state[axis].indexOf(dimId)
      if (from !== -1 && from < index) index -= 1
      list.splice(Math.max(0, Math.min(index, list.length)), 0, dimId)
      next[axis] = list
      return next
    }

    // Take a dimension off the layout. Its selected items are kept, so adding
    // it back restores the selection.
    case 'REMOVE_DIMENSION':
      return withoutDim(state, action.dimId)

    case 'SET_OPTIONS':
      return { ...state, options: { ...state.options, ...action.options } }

    case 'LOAD':
      return {
        ...initialConfig,
        ...action.config,
        options: { ...DEFAULT_OPTIONS, ...action.config?.options },
      }

    case 'RESET':
      return initialConfig

    default:
      return state
  }
}

// ── query ────────────────────────────────────────────────────────────────────

// Returns { error } when the layout can't be queried yet, else { params }
// (URLSearchParams) for /api/analytics/query/. Dimensions are sent columns
// first, then rows, so the response's meta columns follow the layout.
export function buildQuery(config, dimensionsById) {
  const label = (id) => FIXED_DIMENSION_LABELS[id] ?? dimensionsById[id]?.label ?? id
  const items = (id) => config.items[id] ?? []

  if (!axisOf(config, 'dx') || items('dx').length === 0) {
    return { error: 'Choose at least one data item.' }
  }
  if (config.filters.includes('dx')) return { error: 'Data must be in Columns or Rows.' }
  if (!axisOf(config, 'pe') || items('pe').length === 0) {
    return { error: 'Choose at least one period.' }
  }

  const params = new URLSearchParams()
  for (const id of [...config.columns, ...config.rows]) {
    const dim = dimensionsById[id]
    if (dim?.filter_only) return { error: `${label(id)} can only be used as a filter.` }
    // Dynamic dimensions without a selection show every item; the fixed ones
    // need an explicit selection.
    if (['dx', 'pe', 'ou'].includes(id) && items(id).length === 0) {
      return { error: `Choose at least one item for ${label(id)}.` }
    }
    params.append('dimension', `${id}:${items(id).join(';')}`)
  }
  for (const id of config.filters) {
    // An empty filter restricts nothing, so it is left out of the query.
    if (items(id).length === 0) continue
    params.append('filter', `${id}:${items(id).join(';')}`)
  }
  return { params }
}

// ── periods ──────────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const FIXED_PERIOD_TYPES = [
  { id: 'YEAR', label: 'Academic year' },
  { id: 'TERM', label: 'Term' },
  { id: 'QUARTER', label: 'Quarter' },
  { id: 'MONTH', label: 'Month' },
]

// Mirrors analytics/periods.py `period_label`.
export function periodLabel(id) {
  let m
  if ((m = /^(\d{4})$/.exec(id))) return m[1]
  if ((m = /^(\d{4})T([12])$/.exec(id))) return `Term ${m[2]} ${m[1]}`
  if ((m = /^(\d{4})Q([1-4])$/.exec(id))) return `Q${m[2]} ${m[1]}`
  if ((m = /^(\d{4})(0[1-9]|1[0-2])$/.exec(id))) return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`
  return id
}

// Concrete period ids of `type` within academic year `year`.
export function fixedPeriods(type, year) {
  switch (type) {
    case 'YEAR':
      return [String(year)]
    case 'TERM':
      return [`${year}T1`, `${year}T2`]
    case 'QUARTER':
      return [1, 2, 3, 4].map((q) => `${year}Q${q}`)
    case 'MONTH':
      return MONTHS.map((_, i) => `${year}${String(i + 1).padStart(2, '0')}`)
    default:
      return []
  }
}

// ── org units ────────────────────────────────────────────────────────────────

// The `ou` tree flattened depth-first, with `depth` for indentation.
export function flattenTree(nodes, depth = 0, out = []) {
  for (const node of nodes ?? []) {
    out.push({ id: node.id, label: node.label, depth, level: node.level })
    flattenTree(node.children, depth + 1, out)
  }
  return out
}
