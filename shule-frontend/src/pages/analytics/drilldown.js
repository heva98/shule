// Drill-down: the pupils behind one pivot cell, from /api/analytics/drilldown/.
// That endpoint takes the aggregate query narrowed to one cell: Data as the
// only dimension, with a single metric, and every other dimension as a
// filter holding the cell's item.

/**
 * The drill-down params (URLSearchParams) for a cell, or null when the cell
 * can't be drilled into.
 *
 * @param appliedParams  the query string the table was built from
 * @param cellItems      { dimId: itemId } for the cell's layout dimensions
 */
export function buildDrilldownQuery(appliedParams, cellItems) {
  const source = new URLSearchParams(appliedParams)
  const params = new URLSearchParams()
  for (const spec of source.getAll('dimension')) {
    const [id, items = ''] = splitSpec(spec)
    // Data in Filter is sent as a one-item dimension, so it isn't in the cell.
    const item = id in cellItems ? cellItems[id] : singleItem(items)
    // A blank item (a value that wasn't recorded) can't be named in a filter.
    if (!item) return null
    if (id === 'dx') params.append('dimension', `dx:${item}`)
    else params.append('filter', `${id}:${item}`)
  }
  for (const spec of source.getAll('filter')) params.append('filter', spec)
  return params
}

function splitSpec(spec) {
  const i = spec.indexOf(':')
  return i === -1 ? [spec, ''] : [spec.slice(0, i), spec.slice(i + 1)]
}

function singleItem(items) {
  const list = items.split(';').filter(Boolean)
  return list.length === 1 ? list[0] : null
}

/** The metric a cell shows: its Data item, else the query's only metric. */
export function cellMetric(appliedParams, cellItems) {
  if (cellItems.dx) return cellItems.dx
  const dx = new URLSearchParams(appliedParams).getAll('dimension').find((s) => s.startsWith('dx:'))
  return dx ? singleItem(dx.slice(3)) : null
}
