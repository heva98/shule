import { describe, expect, it } from 'vitest'
import { apiErrorMessage, makeLabelFor, unavailableMessage } from './savedVisualizations'

const ref = (label, reason, modules = []) => ({ kind: 'metric', id: label, label, reason, modules })

describe('unavailableMessage', () => {
  it('is null when everything is available', () => {
    expect(unavailableMessage([])).toBeNull()
    expect(unavailableMessage(undefined)).toBeNull()
  })

  it('names the switched-off module', () => {
    expect(unavailableMessage([ref('Collected', 'module_disabled', ['fees'])]))
      .toBe('It uses Collected, from the Fees module, which is switched off for this school.')
  })

  it('lists several items and modules', () => {
    expect(unavailableMessage([
      ref('Collected', 'module_disabled', ['fees']),
      ref('Mean score', 'module_disabled', ['exams', 'reports']),
      ref('Payment method', 'module_disabled', ['fees']),
    ])).toBe('It uses Collected, Mean score and Payment method, from the Fees, Exams and Reports modules, '
      + 'which are switched off for this school.')
  })

  it('explains role restrictions and unknown data', () => {
    expect(unavailableMessage([ref('Collected', 'no_access')])).toBe('It uses Collected, which your role cannot view.')
    expect(unavailableMessage([ref('old.metric', 'unknown')])).toBe('It uses data that is no longer available: old.metric.')
  })
})

describe('makeLabelFor', () => {
  const labels = { gender: { F: 'Female' }, pe: {} }

  it('prefers the response, then the catalogue, then a period label', () => {
    const response = { metaData: { items: { gender: { items: { F: { name: 'Girls' } } } } } }
    expect(makeLabelFor(labels, response)('gender', 'F')).toBe('Girls')
    expect(makeLabelFor(labels, null)('gender', 'F')).toBe('Female')
    expect(makeLabelFor(labels, null)('pe', '2026T1')).toBe('Term 1 2026')
    expect(makeLabelFor(labels, null)('gender', '')).toBe('(blank)')
  })
})

describe('apiErrorMessage', () => {
  it('reads detail, then field errors, then falls back', () => {
    expect(apiErrorMessage({ response: { data: { detail: 'Nope.' } } }, 'x')).toBe('Nope.')
    expect(apiErrorMessage({ response: { data: { config: ['Too large.'] } } }, 'x')).toBe('Too large.')
    expect(apiErrorMessage(new Error('network'), 'Try again.')).toBe('Try again.')
  })
})
