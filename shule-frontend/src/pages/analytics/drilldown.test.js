import { describe, expect, it } from 'vitest'
import { buildDrilldownQuery, cellMetric } from './drilldown'
import { makePivot } from './testing'

const entries = (params) => [...params.entries()]

describe('buildDrilldownQuery', () => {
  const applied = new URLSearchParams([
    ['dimension', 'dx:exam.mean_score;exam.marks_count'],
    ['dimension', 'pe:2026T1;2026T2'],
    ['dimension', 'subject:'],
    ['filter', 'gender:F'],
  ]).toString()

  it('narrows the query to the cell: one metric, everything else a filter', () => {
    const params = buildDrilldownQuery(applied, { dx: 'exam.mean_score', pe: '2026T2', subject: 'MATH' })
    expect(entries(params)).toEqual([
      ['dimension', 'dx:exam.mean_score'],
      ['filter', 'pe:2026T2'],
      ['filter', 'subject:MATH'],
      ['filter', 'gender:F'],
    ])
  })

  it('takes the metric of Data in Filter from its one-item dimension', () => {
    const single = new URLSearchParams([
      ['dimension', 'pe:2026T1'], ['dimension', 'ou:FORM1;FORM2'], ['dimension', 'dx:exam.mean_score'],
    ]).toString()
    const params = buildDrilldownQuery(single, { pe: '2026T1', ou: 'FORM2' })
    expect(entries(params)).toEqual([
      ['filter', 'pe:2026T1'], ['filter', 'ou:FORM2'], ['dimension', 'dx:exam.mean_score'],
    ])
    expect(cellMetric(single, { pe: '2026T1', ou: 'FORM2' })).toBe('exam.mean_score')
  })

  it('refuses a blank item, which a filter cannot name', () => {
    expect(buildDrilldownQuery(applied, { dx: 'exam.mean_score', pe: '2026T1', subject: '' })).toBeNull()
  })
})

describe('pivot cellItems', () => {
  it('names a cell by its layout dimensions only', () => {
    const p = makePivot({ dx: ['m1'], pe: ['T1'] }, () => 1, { columns: ['dx', 'pe'], rows: [] })
    expect(p.cellItems(p.colCombos[0], p.rowCombos[0])).toEqual({ dx: 'm1', pe: 'T1' })
    expect(cellMetric('dimension=dx%3Am1', p.cellItems(p.colCombos[0], p.rowCombos[0]))).toBe('m1')
  })
})
