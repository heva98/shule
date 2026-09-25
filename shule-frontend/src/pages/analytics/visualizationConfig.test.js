import { describe, expect, it } from 'vitest'
import {
  AXES, DEFAULT_OPTIONS, VISUALIZATION_TYPES, axisLabels, axisOf, buildQuery, configReducer,
  fixedPeriods, flattenTree, initialConfig, isChart, layoutProblem, periodLabel, placementError,
} from './visualizationConfig'

const label = (id) => ({ dx: 'Data', pe: 'Period', ou: 'Classes', gender: 'Gender', subject: 'Subject' }[id] ?? id)

// dx (2 metrics) in Columns, pe (2 terms) in Rows, ou in Filter.
const base = {
  ...initialConfig,
  items: { dx: ['m1', 'm2'], pe: ['2026T1', '2026T2'], ou: ['FORM1'], gender: ['F', 'M'] },
}
const cfg = (overrides) => ({ ...base, ...overrides })
const dims = {
  gender: { id: 'gender', label: 'Gender', kind: 'dynamic' },
  subject: { id: 'subject', label: 'Subject', kind: 'dynamic', filter_only: true },
}

describe('configReducer', () => {
  it('sets the type and selected items', () => {
    let s = configReducer(base, { type: 'SET_TYPE', visType: 'PIE' })
    expect(s.type).toBe('PIE')
    s = configReducer(s, { type: 'SET_ITEMS', dimId: 'ou', items: ['FORM2'] })
    expect(s.items.ou).toEqual(['FORM2'])
    expect(s.items.dx).toEqual(['m1', 'm2'])
  })

  it('moves a dimension to the end of another axis', () => {
    const s = configReducer(base, { type: 'MOVE_DIMENSION', dimId: 'ou', axis: 'rows' })
    expect(s.rows).toEqual(['pe', 'ou'])
    expect(s.filters).toEqual([])
  })

  it('inserts a dimension at an index', () => {
    const s = configReducer(base, { type: 'MOVE_DIMENSION', dimId: 'ou', axis: 'rows', index: 0 })
    expect(s.rows).toEqual(['ou', 'pe'])
  })

  it('reorders within an axis, allowing for the item it moves', () => {
    const three = cfg({ rows: ['pe', 'ou', 'gender'], filters: [] })
    // Dropping `pe` before `gender` (index 2) lands it between ou and gender.
    expect(configReducer(three, { type: 'MOVE_DIMENSION', dimId: 'pe', axis: 'rows', index: 2 }).rows)
      .toEqual(['ou', 'pe', 'gender'])
    expect(configReducer(three, { type: 'MOVE_DIMENSION', dimId: 'gender', axis: 'rows', index: 0 }).rows)
      .toEqual(['gender', 'pe', 'ou'])
  })

  it('removes a dimension from the layout but keeps its items', () => {
    const s = configReducer(base, { type: 'REMOVE_DIMENSION', dimId: 'ou' })
    expect(AXES.some((a) => s[a].includes('ou'))).toBe(false)
    expect(s.items.ou).toEqual(['FORM1'])
  })

  it('merges options', () => {
    const s = configReducer(base, { type: 'SET_OPTIONS', options: { targetValue: 50 } })
    expect(s.options).toEqual({ ...DEFAULT_OPTIONS, targetValue: 50 })
  })

  it('fills in default options on LOAD', () => {
    const s = configReducer(base, { type: 'LOAD', config: { ...base, options: { decimals: 1 } } })
    expect(s.options).toEqual({ ...DEFAULT_OPTIONS, decimals: 1 })
  })

  it('resets and ignores unknown actions', () => {
    expect(configReducer(base, { type: 'RESET' })).toBe(initialConfig)
    expect(configReducer(base, { type: 'NOPE' })).toBe(base)
  })
})

describe('axisOf / placementError', () => {
  it('finds the axis holding a dimension', () => {
    expect(axisOf(base, 'pe')).toBe('rows')
    expect(axisOf(base, 'gender')).toBeNull()
  })

  it('keeps filter-only dimensions in Filter', () => {
    expect(placementError(dims.subject, 'rows')).toMatch(/only be used as a filter/)
    expect(placementError(dims.subject, 'filters')).toBeNull()
  })

  it('lets Data go in Filter (the item count is checked by buildQuery)', () => {
    expect(placementError({ id: 'dx', label: 'Data' }, 'filters')).toBeNull()
    expect(placementError(undefined, 'rows')).toBeNull()
  })
})

describe('buildQuery', () => {
  const params = (c) => [...buildQuery(c, dims).params.entries()]

  it('sends columns then rows as dimensions, and filters', () => {
    expect(params(base)).toEqual([
      ['dimension', 'dx:m1;m2'],
      ['dimension', 'pe:2026T1;2026T2'],
      ['filter', 'ou:FORM1'],
    ])
  })

  it('leaves out an empty filter', () => {
    const c = cfg({ filters: ['ou', 'gender'], items: { ...base.items, gender: [] } })
    expect(params(c)).not.toContainEqual(['filter', 'gender:'])
  })

  it('sends an empty dynamic dimension on an axis as "all items"', () => {
    const c = cfg({ rows: ['pe', 'gender'], items: { ...base.items, gender: [] } })
    expect(params(c)).toContainEqual(['dimension', 'gender:'])
  })

  it('sends a single-item Data filter as a dimension', () => {
    const c = cfg({ columns: ['pe'], rows: [], filters: ['dx', 'ou'], items: { ...base.items, dx: ['m1'] } })
    expect(params(c)).toEqual([
      ['dimension', 'pe:2026T1;2026T2'],
      ['dimension', 'dx:m1'],
      ['filter', 'ou:FORM1'],
    ])
  })

  it.each([
    ['no data items', cfg({ items: { ...base.items, dx: [] } }), /at least one data item/],
    ['Data off the layout', cfg({ columns: [] }), /at least one data item/],
    ['several Data items in Filter', cfg({ columns: ['pe'], rows: [], filters: ['dx'] }), /only one item/],
    ['no period', cfg({ rows: [] }), /at least one period/],
    ['no period items', cfg({ items: { ...base.items, pe: [] } }), /at least one period/],
    ['classes on an axis without items', cfg({ rows: ['pe', 'ou'], filters: [], items: { ...base.items, ou: [] } }), /item for Classes/],
    ['a filter-only dimension on an axis', cfg({ rows: ['pe', 'subject'] }), /Subject can only be used as a filter/],
  ])('rejects %s', (_, c, message) => {
    const { params: p, error } = buildQuery(c, dims)
    expect(p).toBeUndefined()
    expect(error).toMatch(message)
  })
})

describe('chart types', () => {
  it('knows which types are charts', () => {
    expect(isChart('PIVOT_TABLE')).toBe(false)
    expect(isChart('COLUMN')).toBe(true)
    expect(isChart('SINGLE_VALUE')).toBe(true)
    expect(isChart('UNKNOWN')).toBe(false)
  })

  it('names the axes Series and Category for charts', () => {
    expect(axisLabels('PIVOT_TABLE')).toMatchObject({ columns: 'Columns', rows: 'Rows' })
    expect(axisLabels('LINE')).toMatchObject({ columns: 'Series', rows: 'Category', filters: 'Filter' })
  })
})

describe('layoutProblem', () => {
  it('has no rules for the pivot table', () => {
    expect(layoutProblem(cfg({ rows: ['pe', 'gender', 'ou'], filters: [] }), label)).toBeNull()
  })

  it.each(['COLUMN', 'STACKED_COLUMN', 'BAR', 'LINE'])('accepts one series and one category for %s', (type) => {
    expect(layoutProblem(cfg({ type }), label)).toBeNull()
    expect(layoutProblem(cfg({ type, rows: [], filters: ['pe', 'ou'] }), label)).toBeNull()
    expect(layoutProblem(cfg({ type, columns: [], rows: ['dx'], filters: ['pe', 'ou'] }), label)).toBeNull()
  })

  it('moves a second category dimension to Filter', () => {
    const p = layoutProblem(cfg({ type: 'COLUMN', rows: ['pe', 'gender'] }), label)
    expect(p.message).toMatch(/one dimension in Series and at most one in Category/)
    expect(p.fixDescription).toBe('move Gender to Filter')
    expect(p.fixed).toMatchObject({ columns: ['dx'], rows: ['pe'], filters: ['gender', 'ou'] })
  })

  it('splits two series dimensions into series and category', () => {
    const p = layoutProblem(cfg({ type: 'LINE', columns: ['dx', 'pe'], rows: [] }), label)
    expect(p.fixed).toMatchObject({ columns: ['dx'], rows: ['pe'], filters: ['ou'] })
  })

  it('flags a chart with nothing on either axis', () => {
    const c = cfg({ type: 'COLUMN', columns: [], rows: [], filters: ['dx', 'pe', 'ou'], items: { ...base.items, dx: ['m1'] } })
    const p = layoutProblem(c, label)
    expect(p).not.toBeNull()
    expect(p.fixed.columns).toEqual(['dx'])
    expect(p.fixed.filters).toEqual(['pe', 'ou'])
  })

  it('gives a pie chart one series and no category', () => {
    const p = layoutProblem(cfg({ type: 'PIE' }), label)
    expect(p.message).toMatch(/pie chart takes exactly one dimension in Series and none in Category/)
    expect(p.fixed).toMatchObject({ columns: ['dx'], rows: [], filters: ['pe', 'ou'] })
    expect(p.fixDescription).toBe('move Period to Filter')
  })

  it('keeps several data items on an axis when fixing a pie chart', () => {
    const p = layoutProblem(cfg({ type: 'PIE', columns: ['pe'], rows: ['dx'] }), label)
    expect(p.fixed).toMatchObject({ columns: ['dx'], rows: [], filters: ['pe', 'ou'] })
  })

  it('moves a single data item to Filter when fixing a pie chart', () => {
    const c = cfg({ type: 'PIE', columns: ['pe'], rows: ['dx'], items: { ...base.items, dx: ['m1'] } })
    const p = layoutProblem(c, label)
    expect(p.fixed).toMatchObject({ columns: ['pe'], rows: [], filters: ['dx', 'ou'] })
    expect(buildQuery(p.fixed, dims).error).toBeUndefined()
  })

  it('reduces a single value to one data item with everything else in Filter', () => {
    const p = layoutProblem(cfg({ type: 'SINGLE_VALUE' }), label)
    expect(p.message).toMatch(/single value shows one number/)
    expect(p.fixed).toMatchObject({ columns: ['dx'], rows: [], filters: ['pe', 'ou'] })
    expect(p.fixed.items.dx).toEqual(['m1'])
    expect(p.fixDescription).toBe('move Period to Filter and keep only the first data item')
  })

  it('accepts a single value with one data item', () => {
    const c = cfg({ type: 'SINGLE_VALUE', rows: [], filters: ['pe', 'ou'], items: { ...base.items, dx: ['m1'] } })
    expect(layoutProblem(c, label)).toBeNull()
  })

  it('flags several data items in Filter', () => {
    const c = cfg({ type: 'COLUMN', columns: ['pe'], rows: [], filters: ['dx', 'ou'] })
    const p = layoutProblem(c, label)
    expect(p.message).toMatch(/Data in Filter can hold only one item/)
    expect(p.fixed.columns).toEqual(['dx'])
    expect(p.fixed.filters).not.toContain('dx')
  })

  // Every fix must produce a layout the type accepts, lose no dimension, and
  // be queryable.
  const layouts = [
    { columns: ['dx'], rows: ['pe'], filters: ['ou'] },
    { columns: ['dx', 'pe'], rows: ['ou', 'gender'], filters: [] },
    { columns: [], rows: ['pe', 'dx', 'ou'], filters: ['gender'] },
    { columns: ['ou'], rows: [], filters: ['dx', 'pe'] },
    { columns: ['pe', 'ou'], rows: ['dx'], filters: [] },
  ]
  const chartTypes = VISUALIZATION_TYPES.filter((t) => t.chart).map((t) => t.id)
  for (const type of chartTypes) {
    for (const [i, layout] of layouts.entries()) {
      for (const dx of [['m1'], ['m1', 'm2']]) {
        it(`fixes ${type} layout #${i} with ${dx.length} data item(s)`, () => {
          const c = cfg({ type, ...layout, items: { ...base.items, dx } })
          const fixed = layoutProblem(c, label)?.fixed ?? c
          expect(layoutProblem(fixed, label)).toBeNull()
          const before = [...c.columns, ...c.rows, ...c.filters].sort()
          const after = [...fixed.columns, ...fixed.rows, ...fixed.filters].sort()
          expect(after).toEqual(before)
          expect(buildQuery(fixed, dims).error).toBeUndefined()
        })
      }
    }
  }
})

describe('periods', () => {
  it.each([
    ['2026', '2026'],
    ['2026T2', 'Term 2 2026'],
    ['2026Q3', 'Q3 2026'],
    ['202603', 'March 2026'],
    ['THIS_TERM', 'THIS_TERM'],
    ['2026T3', '2026T3'],
  ])('labels %s as %s', (id, text) => {
    expect(periodLabel(id)).toBe(text)
  })

  it('lists the fixed periods of a year', () => {
    expect(fixedPeriods('YEAR', 2026)).toEqual(['2026'])
    expect(fixedPeriods('TERM', 2026)).toEqual(['2026T1', '2026T2'])
    expect(fixedPeriods('QUARTER', 2026)).toEqual(['2026Q1', '2026Q2', '2026Q3', '2026Q4'])
    expect(fixedPeriods('MONTH', 2026)).toHaveLength(12)
    expect(fixedPeriods('MONTH', 2026)[11]).toBe('202612')
    expect(fixedPeriods('WEEK', 2026)).toEqual([])
  })
})

describe('flattenTree', () => {
  it('flattens depth-first with depths', () => {
    const tree = [{
      id: 'SCHOOL', label: 'School', level: 'school', children: [
        { id: 'OLEVEL', label: 'O level', level: 'section', children: [{ id: 'FORM1', label: 'Form 1', level: 'level' }] },
        { id: 'ALEVEL', label: 'A level', level: 'section', children: [] },
      ],
    }]
    expect(flattenTree(tree).map((n) => [n.id, n.depth])).toEqual([
      ['SCHOOL', 0], ['OLEVEL', 1], ['FORM1', 2], ['ALEVEL', 1],
    ])
    expect(flattenTree(undefined)).toEqual([])
  })
})
