import { describe, expect, it } from 'vitest'
import { buildPivot, formatValue, headerSpans } from './pivot'
import { makePivot, makeResponse, testLabel } from './testing'
import { DEFAULT_OPTIONS } from './visualizationConfig'

const dims = { dx: ['m1', 'm2'], pe: ['T1', 'T2'] }
const values = { 'm1|T1': 10, 'm1|T2': 20, 'm2|T1': 30, 'm2|T2': 40 }
const value = ({ dx, pe }) => values[`${dx}|${pe}`] ?? null

describe('buildPivot', () => {
  it('looks up cells by column and row combo', () => {
    const p = makePivot(dims, value, { columns: ['dx'], rows: ['pe'] })
    expect(p.colCombos).toEqual([['m1'], ['m2']])
    expect(p.rowCombos).toEqual([['T1'], ['T2']])
    expect(p.cell(['m2'], ['T1'])).toEqual({ value: 30, suppressed: false, unit: 'count' })
    expect(p.isEmpty).toBe(false)
  })

  it('finds the same cells whichever way the layout is arranged', () => {
    const p = makePivot(dims, value, { columns: ['pe'], rows: ['dx'] })
    expect(p.cell(['T2'], ['m1']).value).toBe(20)
  })

  it('crosses several dimensions on one axis', () => {
    const p = makePivot(dims, value, { columns: ['dx', 'pe'], rows: [] })
    expect(p.colCombos).toEqual([['m1', 'T1'], ['m1', 'T2'], ['m2', 'T1'], ['m2', 'T2']])
    expect(p.rowDims).toHaveLength(1)
    expect(p.isPlaceholder(p.rowDims[0])).toBe(true)
    expect(p.label(p.rowDims[0], p.rowCombos[0][0])).toBe('Value')
    expect(p.cell(['m2', 'T2'], p.rowCombos[0]).value).toBe(40)
  })

  it('ignores response dimensions that are not on the layout', () => {
    // A single-item Data filter comes back as a dx column.
    const p = makePivot({ dx: ['m1'], pe: ['T1', 'T2'] }, value, { columns: ['pe'], rows: [] })
    expect(p.cell(['T2'], p.rowCombos[0]).value).toBe(20)
  })

  it('returns null for cells missing from the response', () => {
    const p = makePivot(dims, ({ dx, pe }) => (dx === 'm1' && pe === 'T1' ? 5 : null), { columns: ['dx'], rows: ['pe'] })
    expect(p.cell(['m2'], ['T2'])).toBeNull()
  })

  it('hides empty rows and columns on request', () => {
    const only = ({ dx, pe }) => (dx === 'm1' && pe === 'T1' ? 5 : null)
    const layout = { columns: ['dx'], rows: ['pe'] }
    expect(makePivot(dims, only, layout).rowCombos).toHaveLength(2)
    const p = makePivot(dims, only, layout, { options: { hideEmptyRows: true, hideEmptyColumns: true } })
    expect(p.rowCombos).toEqual([['T1']])
    expect(p.colCombos).toEqual([['m1']])
  })

  it('marks suppressed cells', () => {
    const p = makePivot(dims, ({ dx }) => (dx === 'm1' ? { value: null, suppressed: true } : 1), { columns: ['dx'], rows: ['pe'] })
    expect(p.hasSuppressed).toBe(true)
    expect(p.cell(['m1'], ['T1'])).toMatchObject({ suppressed: true, value: null })
    expect(p.cell(['m2'], ['T1']).suppressed).toBe(false)
  })

  it('takes each metric’s unit from the response', () => {
    const p = makePivot(dims, value, { columns: ['dx'], rows: ['pe'] }, { units: { m1: 'percent' } })
    expect(p.cell(['m1'], ['T1']).unit).toBe('percent')
    expect(p.cell(['m2'], ['T1']).unit).toBe('count')
  })

  it('reports an empty response', () => {
    const p = buildPivot(makeResponse(dims, () => null), { columns: ['dx'], rows: ['pe'] }, DEFAULT_OPTIONS, testLabel)
    expect(p.isEmpty).toBe(true)
  })

  it('labels items through labelFor', () => {
    const p = makePivot(dims, value, { columns: ['dx'], rows: ['pe'] })
    expect(p.label('pe', 'T1')).toBe('pe:T1')
  })
})

describe('headerSpans', () => {
  const combos = [['a', 'x'], ['a', 'y'], ['b', 'x'], ['b', 'y'], ['b', 'z']]

  it('merges runs sharing the prefix up to the level', () => {
    expect(headerSpans(combos, 0)).toEqual([
      { start: 0, span: 2, id: 'a' },
      { start: 2, span: 3, id: 'b' },
    ])
  })

  it('does not merge equal items under different parents', () => {
    // ['a','y'] and ['b','x'] are adjacent but differ at level 0.
    expect(headerSpans([['a', 'x'], ['b', 'x']], 1)).toEqual([
      { start: 0, span: 1, id: 'x' },
      { start: 1, span: 1, id: 'x' },
    ])
  })
})

describe('formatValue', () => {
  it.each([
    [1234, 'count', 'auto', '1,234'],
    [1234.6, 'count', 'auto', '1,235'],
    [56.789, 'percent', 'auto', '56.79%'],
    [56, 'percent', 'auto', '56%'],
    [56, 'percent', 1, '56.0%'],
    [3.14159, 'score', 2, '3.14'],
    [7, 'count', 2, '7.00'],
    [0, 'count', 'auto', '0'],
  ])('formats %s (%s, %s decimals) as %s', (v, unit, decimals, text) => {
    expect(formatValue(v, unit, decimals)).toBe(text)
  })

  it('formats missing values as blank', () => {
    expect(formatValue(null, 'count', 'auto')).toBe('')
    expect(formatValue(undefined, 'percent', 1)).toBe('')
  })
})
