// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPTIONS } from '../visualizationConfig'
import OptionsModal from './OptionsModal'

afterEach(cleanup)

function open(type, options = DEFAULT_OPTIONS) {
  const onApply = vi.fn()
  const onClose = vi.fn()
  render(<OptionsModal type={type} options={options} onApply={onApply} onClose={onClose} />)
  return { onApply, onClose }
}

const apply = () => fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

describe('OptionsModal', () => {
  it('shows table options for a pivot table', () => {
    open('PIVOT_TABLE')
    expect(screen.getByLabelText('Show dimension labels')).toBeTruthy()
    expect(screen.getByLabelText('Hide empty rows')).toBeTruthy()
    expect(screen.queryByLabelText('Show data labels')).toBeNull()
    expect(screen.queryByText('Sort order')).toBeNull()
    expect(screen.queryByText('Target line')).toBeNull()
  })

  it('shows chart options for a column chart', () => {
    open('COLUMN')
    expect(screen.queryByLabelText('Show dimension labels')).toBeNull()
    expect(screen.getByLabelText('Show data labels')).toBeTruthy()
    expect(screen.getByLabelText('Hide empty categories')).toBeTruthy()
    expect(screen.getByText('Sort order')).toBeTruthy()
    expect(screen.getByText('Target line')).toBeTruthy()
  })

  it('has no target line for a pie chart', () => {
    open('PIE')
    expect(screen.getByLabelText('Show data labels')).toBeTruthy()
    expect(screen.queryByText('Target line')).toBeNull()
  })

  it('offers only decimals and the target for a single value', () => {
    open('SINGLE_VALUE')
    expect(screen.queryByLabelText('Show data labels')).toBeNull()
    expect(screen.queryByText('Sort order')).toBeNull()
    expect(screen.queryByLabelText('Hide empty categories')).toBeNull()
    expect(screen.getByText('Decimal places')).toBeTruthy()
    expect(screen.getByText(/above or below this number/)).toBeTruthy()
  })

  it('applies the chosen chart options with the target as a number', () => {
    const { onApply } = open('COLUMN')
    fireEvent.click(screen.getByLabelText('Show data labels'))
    fireEvent.change(screen.getByDisplayValue('As selected'), { target: { value: 'desc' } })
    fireEvent.change(screen.getByDisplayValue('Automatic'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Target value'), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText('Target label'), { target: { value: 'Pass mark' } })
    apply()
    expect(onApply).toHaveBeenCalledWith({
      ...DEFAULT_OPTIONS,
      showDataLabels: true,
      sortOrder: 'desc',
      decimals: 1,
      targetValue: 50,
      targetLabel: 'Pass mark',
    })
  })

  it('clears the target when the value is emptied', () => {
    const { onApply } = open('LINE', { ...DEFAULT_OPTIONS, targetValue: 40 })
    expect(screen.getByLabelText('Target value').value).toBe('40')
    fireEvent.change(screen.getByLabelText('Target value'), { target: { value: '' } })
    apply()
    expect(onApply.mock.calls[0][0].targetValue).toBeNull()
  })

  it('keeps the saved target for types without a target line', () => {
    const { onApply } = open('PIE', { ...DEFAULT_OPTIONS, targetValue: 40 })
    apply()
    expect(onApply.mock.calls[0][0].targetValue).toBe(40)
  })

  it('closes without applying on Cancel', () => {
    const { onApply, onClose } = open('COLUMN')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(onApply).not.toHaveBeenCalled()
  })
})
