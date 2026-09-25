import { describe, expect, it } from 'vitest'
import { MAX_SERIES, SERIES_COLORS, buildChartModel, tickFormatter } from './charts'
import { makePivot } from './testing'
import { DEFAULT_OPTIONS } from './visualizationConfig'

const opts = (o) => ({ ...DEFAULT_OPTIONS, ...o })

// Mean score (percent) and pass rate (percent) for two classes over two terms.
const dims = { dx: ['mean', 'pass'], pe: ['T1', 'T2'] }
const values = { 'mean|T1': 50, 'mean|T2': 70, 'pass|T1': 40, 'pass|T2': 10 }
const value = ({ dx, pe }) => values[`${dx}|${pe}`] ?? null
const units = { mean: 'percent', pass: 'percent' }

describe('buildChartModel: cartesian charts', () => {
  const pivot = makePivot(dims, value, { columns: ['dx'], rows: ['pe'] }, { units })

  it('draws one series per column item and one category per row item', () => {
    const m = buildChartModel(pivot, 'COLUMN', opts())
    expect(m.series).toEqual([
      { key: 's0', name: 'dx:mean', color: SERIES_COLORS[0] },
      { key: 's1', name: 'dx:pass', color: SERIES_COLORS[1] },
    ])
    expect(m.data.map((r) => [r.category, r.s0, r.s1])).toEqual([
      ['pe:T1', 50, 40],
      ['pe:T2', 70, 10],
    ])
    expect(m.seriesDim).toBe('dx')
    expect(m.categoryDim).toBe('pe')
    expect(m.unit).toBe('percent')
    expect(m.tooMany).toBeNull()
  })

  it('pre-formats data labels with the chosen decimals', () => {
    const m = buildChartModel(pivot, 'COLUMN', opts({ decimals: 1 }))
    expect(m.data[0].s0__label).toBe('50.0%')
    expect(m.data[0].s0__cell).toMatchObject({ value: 50, unit: 'percent' })
  })

  it('uses series keys safe for recharts, whatever the item ids', () => {
    // Metric ids contain dots, which recharts would read as a path.
    const p = makePivot({ dx: ['exam.mean_score'], pe: ['T1'] }, () => 1, { columns: ['dx'], rows: ['pe'] })
    const m = buildChartModel(p, 'LINE', opts())
    expect(m.series[0].key).toBe('s0')
    expect(m.data[0].s0).toBe(1)
  })

  it('sorts categories by their total, keeping each series’ colour', () => {
    // Totals: T1 = 90, T2 = 80.
    const asc = buildChartModel(pivot, 'STACKED_COLUMN', opts({ sortOrder: 'asc' }))
    expect(asc.data.map((r) => r.category)).toEqual(['pe:T2', 'pe:T1'])
    const desc = buildChartModel(pivot, 'STACKED_COLUMN', opts({ sortOrder: 'desc' }))
    expect(desc.data.map((r) => r.category)).toEqual(['pe:T1', 'pe:T2'])
    expect(desc.series.map((s) => s.color)).toEqual([SERIES_COLORS[0], SERIES_COLORS[1]])
  })

  it('keeps the selection order when not sorting', () => {
    const m = buildChartModel(pivot, 'BAR', opts({ sortOrder: 'none' }))
    expect(m.data.map((r) => r.category)).toEqual(['pe:T1', 'pe:T2'])
  })

  it('draws a series-only layout as the categories of one unnamed series', () => {
    // Data (one item, in Filter) comes back as a column but isn't on the layout.
    const p = makePivot({ dx: ['mean'], pe: ['T1', 'T2'] }, value, { columns: ['pe'], rows: [] }, { units })
    const m = buildChartModel(p, 'COLUMN', opts())
    expect(m.series).toEqual([{ key: 's0', name: null, color: SERIES_COLORS[0] }])
    expect(m.data.map((r) => [r.category, r.s0])).toEqual([['pe:T1', 50], ['pe:T2', 70]])
    expect(m.seriesDim).toBeNull()
    expect(m.categoryDim).toBe('pe')
  })

  it('draws a category-only layout as one unnamed series', () => {
    const p = makePivot({ dx: ['mean'], pe: ['T1', 'T2'] }, value, { columns: [], rows: ['pe'] }, { units })
    const m = buildChartModel(p, 'LINE', opts())
    expect(m.series).toHaveLength(1)
    expect(m.series[0].name).toBeNull()
    expect(m.data.map((r) => r.s0)).toEqual([50, 70])
  })

  it('leaves suppressed and missing cells as gaps', () => {
    const p = makePivot(dims, ({ dx, pe }) => {
      if (dx === 'mean' && pe === 'T1') return { value: null, suppressed: true }
      if (dx === 'pass' && pe === 'T2') return null
      return 5
    }, { columns: ['dx'], rows: ['pe'] })
    const m = buildChartModel(p, 'COLUMN', opts())
    expect(m.data[0].s0).toBeNull()
    expect(m.data[0].s0__label).toBe('*')
    expect(m.data[1].s1).toBeNull()
    expect(m.data[1].s1__label).toBe('')
    expect(m.hasSuppressed).toBe(true)
  })

  it('reports a mixed unit as null', () => {
    const p = makePivot(dims, value, { columns: ['dx'], rows: ['pe'] }, { units: { mean: 'percent', pass: 'count' } })
    expect(buildChartModel(p, 'COLUMN', opts()).unit).toBeNull()
  })

  it('flags more series than there are colours', () => {
    const many = Array.from({ length: MAX_SERIES + 1 }, (_, i) => `c${i}`)
    const p = makePivot({ dx: ['mean'], ou: many, pe: ['T1'] }, () => 1, { columns: ['ou'], rows: ['pe'] })
    expect(buildChartModel(p, 'COLUMN', opts()).tooMany).toBe(MAX_SERIES + 1)
    // As categories they're fine: only series need colours.
    const q = makePivot({ dx: ['mean'], ou: many, pe: ['T1'] }, () => 1, { columns: ['pe'], rows: ['ou'] })
    expect(buildChartModel(q, 'COLUMN', opts()).tooMany).toBeNull()
  })
})

describe('buildChartModel: pie', () => {
  const classes = { dx: ['n'], ou: ['A', 'B', 'C', 'D'] }
  const counts = { A: 10, B: 30, C: 0, D: 20 }
  const pivot = makePivot(classes, ({ ou }) => counts[ou], { columns: ['ou'], rows: [] })

  it('makes one slice per series item, dropping empty ones', () => {
    const m = buildChartModel(pivot, 'PIE', opts())
    expect(m.data.map((s) => [s.name, s.value, s.label])).toEqual([
      ['ou:A', 10, '10'],
      ['ou:B', 30, '30'],
      ['ou:D', 20, '20'],
    ])
    expect(m.series).toBe(m.data)
  })

  it('colours slices by item, not by rank', () => {
    const m = buildChartModel(pivot, 'PIE', opts({ sortOrder: 'desc' }))
    expect(m.data.map((s) => s.name)).toEqual(['ou:B', 'ou:D', 'ou:A'])
    expect(m.data.map((s) => s.color)).toEqual([SERIES_COLORS[1], SERIES_COLORS[3], SERIES_COLORS[0]])
  })

  it('drops suppressed slices but notes them', () => {
    const p = makePivot(classes, ({ ou }) => (ou === 'A' ? { value: null, suppressed: true } : 5), { columns: ['ou'], rows: [] })
    const m = buildChartModel(p, 'PIE', opts())
    expect(m.data.map((s) => s.name)).not.toContain('ou:A')
    expect(m.hasSuppressed).toBe(true)
  })

  it('flags too many slices', () => {
    const many = Array.from({ length: MAX_SERIES + 2 }, (_, i) => `c${i}`)
    const p = makePivot({ dx: ['n'], ou: many }, () => 1, { columns: ['ou'], rows: [] })
    expect(buildChartModel(p, 'PIE', opts()).tooMany).toBe(MAX_SERIES + 2)
  })
})

describe('buildChartModel: single value', () => {
  it('shows the one cell', () => {
    const p = makePivot({ dx: ['mean'] }, () => 57.25, { columns: ['dx'], rows: [] }, { units })
    const m = buildChartModel(p, 'SINGLE_VALUE', opts({ decimals: 1 }))
    expect(m.single).toMatchObject({ name: 'dx:mean', text: '57.3%' })
    expect(m.unit).toBe('percent')
    expect(m.hasSuppressed).toBe(false)
  })

  it('shows a suppressed value as *', () => {
    const p = makePivot({ dx: ['mean'] }, () => ({ value: null, suppressed: true }), { columns: ['dx'], rows: [] })
    const m = buildChartModel(p, 'SINGLE_VALUE', opts())
    expect(m.single.text).toBe('*')
    expect(m.hasSuppressed).toBe(true)
  })

  it('shows a missing value as blank', () => {
    const p = makePivot({ dx: ['mean'] }, () => null, { columns: ['dx'], rows: [] })
    const m = buildChartModel(p, 'SINGLE_VALUE', opts())
    expect(m.single.cell).toBeNull()
    expect(m.single.text).toBe('')
  })
})

describe('tickFormatter', () => {
  it('compacts numbers and adds % for percentages', () => {
    expect(tickFormatter('count')(1500)).toBe('1.5K')
    expect(tickFormatter('count')(20)).toBe('20')
    expect(tickFormatter('percent')(75)).toBe('75%')
    expect(tickFormatter(null)(75)).toBe('75')
  })
})
