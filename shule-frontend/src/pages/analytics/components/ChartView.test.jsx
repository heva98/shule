// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MAX_SERIES, buildChartModel } from '../charts'
import { makePivot } from '../testing'
import { DEFAULT_OPTIONS } from '../visualizationConfig'
import ChartView from './ChartView'

// recharts' ResponsiveContainer measures itself; jsdom has no layout.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})
afterEach(cleanup)

const opts = (o) => ({ ...DEFAULT_OPTIONS, ...o })

function single(value, unit = 'percent', options = opts()) {
  const p = makePivot({ dx: ['mean'] }, () => value, { columns: ['dx'], rows: [] }, { units: { mean: unit } })
  return { model: buildChartModel(p, 'SINGLE_VALUE', options), options }
}

describe('ChartView: single value', () => {
  it('draws the value and its name as an SVG', () => {
    const { model, options } = single(57.2)
    const { container } = render(<ChartView model={model} options={options} subtitle="Classes: Form 1" />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('aria-label')).toBe('dx:mean: 57.2%')
    expect(screen.getByText('57.2%')).toBeTruthy()
    expect(screen.getByText('Classes: Form 1')).toBeTruthy()
  })

  it('shows the gap above a percentage target in points', () => {
    const { model, options } = single(57.2, 'percent', opts({ targetValue: 50, targetLabel: 'Pass mark' }))
    render(<ChartView model={model} options={options} />)
    expect(screen.getByText('▲ 7.2 points above Pass mark')).toBeTruthy()
  })

  it('shows the gap below a count target in the value’s unit', () => {
    const { model, options } = single(40, 'count', opts({ targetValue: 55 }))
    render(<ChartView model={model} options={options} />)
    expect(screen.getByText('▼ 15 below Target')).toBeTruthy()
  })

  it('explains a hidden value and skips the target', () => {
    const { model, options } = single({ value: null, suppressed: true }, 'percent', opts({ targetValue: 50 }))
    render(<ChartView model={model} options={options} />)
    expect(screen.getByText('Hidden: too few pupils')).toBeTruthy()
    expect(screen.queryByText(/above|below/)).toBeNull()
  })

  it('puts the forwarded ref on the drawing', () => {
    const { model, options } = single(1)
    const ref = { current: null }
    render(<ChartView ref={ref} model={model} options={options} />)
    expect(ref.current.querySelector('svg')).toBeTruthy()
  })
})

describe('ChartView: too many series', () => {
  const many = Array.from({ length: MAX_SERIES + 1 }, (_, i) => `c${i}`)

  it('offers to swap series and category when that would fit', () => {
    const p = makePivot({ dx: ['n'], ou: many, pe: ['T1', 'T2'] }, () => 1, { columns: ['ou'], rows: ['pe'] })
    const onSwapAxes = vi.fn()
    render(<ChartView model={buildChartModel(p, 'COLUMN', opts())} options={opts()} onSwapAxes={onSwapAxes} />)
    expect(screen.getByText('Too many series to tell apart')).toBeTruthy()
    expect(screen.getByText(new RegExp(`need ${MAX_SERIES + 1} colours`))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Swap Series and Category/ }))
    expect(onSwapAxes).toHaveBeenCalled()
  })

  it('does not offer the swap for a pie chart', () => {
    const p = makePivot({ dx: ['n'], ou: many }, () => 1, { columns: ['ou'], rows: [] })
    render(<ChartView model={buildChartModel(p, 'PIE', opts())} options={opts()} />)
    expect(screen.getByText('Too many slices to tell apart')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Swap/ })).toBeNull()
  })
})

describe('ChartView: legend', () => {
  it('lists each named series', () => {
    const p = makePivot({ dx: ['mean', 'pass'], pe: ['T1'] }, () => 1, { columns: ['dx'], rows: ['pe'] })
    render(<ChartView model={buildChartModel(p, 'COLUMN', opts())} options={opts()} />)
    expect(screen.getByText('dx:mean')).toBeTruthy()
    expect(screen.getByText('dx:pass')).toBeTruthy()
  })

  it('has no legend for a single series', () => {
    const p = makePivot({ dx: ['mean'], pe: ['T1', 'T2'] }, () => 1, { columns: ['dx'], rows: ['pe'] })
    const { container } = render(<ChartView model={buildChartModel(p, 'LINE', opts())} options={opts()} />)
    expect(container.querySelector('ul')).toBeNull()
  })
})
