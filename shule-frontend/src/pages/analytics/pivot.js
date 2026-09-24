// Turns an /api/analytics/query/ response (DHIS2 shape: meta columns, then
// value and suppressed) into a pivot-table model for a given layout.

// Stands in for an empty Columns or Rows axis, so the table still has one
// header column / row to hang the values on.
const NONE = '__none'

function product(lists) {
  return lists.reduce(
    (acc, list) => acc.flatMap((prefix) => list.map((item) => [...prefix, item])),
    [[]],
  )
}

/**
 * @param response  the query response
 * @param layout    { columns, rows } as sent with the query
 * @param options   the config's display options
 * @param labelFor  (dimId, itemId) => display label
 */
export function buildPivot(response, layout, options, labelFor) {
  const { headers, rows, metaData } = response
  const index = Object.fromEntries(headers.map((h, i) => [h.name, i]))
  const valueIdx = index.value
  const suppressedIdx = index.suppressed

  const colDims = layout.columns.length ? layout.columns : [NONE]
  const rowDims = layout.rows.length ? layout.rows : [NONE]
  const itemsOf = (dim) => (dim === NONE ? [NONE] : metaData.dimensions[dim] ?? [])

  const keyOf = (colCombo, rowCombo) => {
    const parts = []
    colDims.forEach((d, i) => d !== NONE && parts.push(`${d}=${colCombo[i]}`))
    rowDims.forEach((d, i) => d !== NONE && parts.push(`${d}=${rowCombo[i]}`))
    return parts.sort().join('\u0001')
  }

  const cells = new Map()
  let hasSuppressed = false
  for (const row of rows) {
    const parts = headers
      .filter((h) => h.meta)
      .map((h) => `${h.name}=${row[index[h.name]]}`)
      .sort()
    const suppressed = Boolean(row[suppressedIdx])
    hasSuppressed ||= suppressed
    const dx = row[index.dx]
    cells.set(parts.join('\u0001'), {
      value: row[valueIdx],
      suppressed,
      unit: metaData.items.dx?.items?.[dx]?.unit ?? 'count',
    })
  }

  let colCombos = product(colDims.map(itemsOf))
  let rowCombos = product(rowDims.map(itemsOf))
  const has = (c, r) => cells.has(keyOf(c, r))
  if (options.hideEmptyColumns) colCombos = colCombos.filter((c) => rowCombos.some((r) => has(c, r)))
  if (options.hideEmptyRows) rowCombos = rowCombos.filter((r) => colCombos.some((c) => has(c, r)))

  const label = (dim, id) => (dim === NONE ? 'Value' : labelFor(dim, id))

  return {
    colDims,
    rowDims,
    colCombos,
    rowCombos,
    hasSuppressed,
    isEmpty: rows.length === 0,
    cell: (colCombo, rowCombo) => cells.get(keyOf(colCombo, rowCombo)) ?? null,
    label,
    isPlaceholder: (dim) => dim === NONE,
  }
}

// Header cells for one level of a (column or row) header: consecutive combos
// sharing the prefix up to `level` merge into one cell spanning them.
export function headerSpans(combos, level) {
  const spans = []
  combos.forEach((combo, i) => {
    const prev = spans[spans.length - 1]
    const samePrefix = prev && combo.slice(0, level + 1).every((v, j) => v === combos[prev.start][j])
    if (samePrefix) prev.span += 1
    else spans.push({ start: i, span: 1, id: combo[level] })
  })
  return spans
}

const numberFormats = new Map()
function numberFormat(digits) {
  const key = String(digits)
  if (!numberFormats.has(key)) {
    numberFormats.set(key, new Intl.NumberFormat('en-US', {
      minimumFractionDigits: digits === 'auto' ? 0 : digits,
      maximumFractionDigits: digits === 'auto' ? 2 : digits,
    }))
  }
  return numberFormats.get(key)
}

export function formatValue(value, unit, decimals) {
  if (value === null || value === undefined) return ''
  const digits = decimals === 'auto' && unit === 'count' ? 0 : decimals
  const text = numberFormat(digits).format(value)
  return unit === 'percent' ? `${text}%` : text
}
