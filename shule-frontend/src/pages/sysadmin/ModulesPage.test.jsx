// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getModules, updateModules } from '../../api/sysadmin'
import ModulesPage from './ModulesPage'
import { toggleModule } from './modules'

vi.mock('../../api/sysadmin', () => ({ getModules: vi.fn(), updateModules: vi.fn() }))
const refreshUser = vi.fn(() => Promise.resolve({}))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ refreshUser }) }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const mod = (key, label, extra = {}) => ({
  key, label, description: `${label} things`, licensed: true, enabled: false, requires: [], ...extra,
})
const MODULES = [
  mod('fees', 'Fees', { enabled: true }),
  mod('exams', 'Exams', { enabled: true }),
  mod('reports', 'Exam reports', { enabled: true, requires: ['exams'] }),
  mod('analytics', 'Analytics'),
  mod('boarding', 'Boarding', { licensed: false }),
]

describe('toggleModule', () => {
  it('switches on what a module needs, and off what needs it', () => {
    expect([...toggleModule(new Set(), MODULES, 'reports', true)].sort()).toEqual(['exams', 'reports'])
    expect([...toggleModule(new Set(['exams', 'reports', 'fees']), MODULES, 'exams', false)]).toEqual(['fees'])
  })
})

describe('ModulesPage', () => {
  beforeEach(() => {
    getModules.mockResolvedValue({ source: 'env', modules: MODULES })
    updateModules.mockImplementation((enabled) => Promise.resolve({
      source: 'admin', modules: MODULES.map((m) => ({ ...m, enabled: enabled.includes(m.key) })),
    }))
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  function renderPage() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={qc}><ModulesPage /></QueryClientProvider>)
  }
  const sw = (name) => screen.getByRole('switch', { name })

  it('shows each licensed module with its state, and unlicensed ones locked', async () => {
    renderPage()
    expect(await screen.findByRole('switch', { name: 'Fees' })).toHaveProperty('ariaChecked', 'true')
    expect(sw('Analytics').getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByRole('switch', { name: 'Boarding' })).toBeNull()
    expect(screen.getByText('Not licensed')).toBeTruthy()
    expect(screen.getByText(/chosen when the system was installed/)).toBeTruthy()
  })

  it('saves a switch-on straight away and refreshes the signed-in user', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('switch', { name: 'Analytics' }))
    expect(screen.getByText('Switching on: Analytics')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateModules).toHaveBeenCalled())
    expect(updateModules.mock.calls[0][0].sort()).toEqual(['analytics', 'exams', 'fees', 'reports'])
    await waitFor(() => expect(refreshUser).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull())
  })

  it('asks before switching modules off, including their dependants', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('switch', { name: 'Exams' }))
    expect(sw('Exam reports').getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(updateModules).not.toHaveBeenCalled()
    expect(screen.getByText(/Exams, Exam reports will be hidden for every user/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Switch off' }))
    await waitFor(() => expect(updateModules).toHaveBeenCalledWith(['fees']))
  })

  it('discards unsaved changes', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('switch', { name: 'Fees' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(sw('Fees').getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })
})
