import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Lock } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { getModules, updateModules } from '../../api/sysadmin'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Modal from '../../components/ui/Modal'
import { useAuth } from '../../context/AuthContext'
import { toggleModule } from './modules'

function Switch({ checked, disabled, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed
        ${checked ? 'bg-primary' : 'bg-gray-200'} ${disabled ? 'opacity-50' : ''}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform
        ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function ModuleRow({ module, modules, on, onToggle }) {
  const needs = module.requires.map((r) => modules.find((m) => m.key === r)?.label ?? r)
  return (
    <li className="flex items-start gap-4 py-3.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{module.label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{module.description}</p>
        {needs.length > 0 && module.licensed && (
          <p className="text-xs text-gray-400 mt-0.5">Needs {needs.join(', ')}.</p>
        )}
      </div>
      {module.licensed ? (
        <Switch checked={on} onChange={(v) => onToggle(module.key, v)} label={module.label} />
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-gray-400 shrink-0 pt-0.5">
          <Lock size={12} /> Not licensed
        </span>
      )}
    </li>
  )
}

export default function ModulesPage() {
  const qc = useQueryClient()
  const { refreshUser } = useAuth()
  const q = useQuery({ queryKey: ['admin-modules'], queryFn: getModules })
  // The admin's unsaved selection; null while it matches the server.
  const [draft, setDraft] = useState(null)
  const [confirmOff, setConfirmOff] = useState(null)

  const modules = q.data?.modules ?? []
  const saved = new Set(modules.filter((m) => m.enabled).map((m) => m.key))
  const current = draft ?? saved
  const turningOff = modules.filter((m) => saved.has(m.key) && !current.has(m.key))
  const turningOn = modules.filter((m) => !saved.has(m.key) && current.has(m.key))
  const dirty = turningOff.length + turningOn.length > 0

  const mut = useMutation({
    mutationFn: () => updateModules([...current]),
    onSuccess: async (data) => {
      qc.setQueryData(['admin-modules'], data)
      setDraft(null)
      setConfirmOff(null)
      toast.success('Modules saved.')
      // The sidebar, route guards and every module-gated query follow the
      // user payload's enabled_modules.
      await refreshUser().catch(() => {})
      qc.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'admin-modules' })
    },
    onError: (err) => {
      setConfirmOff(null)
      toast.error(err.response?.data?.enabled ?? err.response?.data?.detail ?? 'Failed to save modules.')
    },
  })

  function save() {
    if (turningOff.length) setConfirmOff(turningOff)
    else mut.mutate()
  }

  if (q.isLoading) {
    return <Card padding="p-6" className="animate-pulse h-64" />
  }
  if (q.isError) {
    return <Card padding="p-6"><p className="text-sm text-danger">Modules could not be loaded.</p></Card>
  }

  const licensed = modules.filter((m) => m.licensed)
  const unlicensed = modules.filter((m) => !m.licensed)
  const toggle = (key, on) => setDraft(toggleModule(current, modules, key, on))

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Modules</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Choose which parts of Shule SMS this school uses. A module that is off disappears from the menus for
          everyone. Nothing is deleted: switch it back on and everything is still there.
        </p>
      </div>

      {q.data.source === 'env' && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>These are the modules chosen when the system was installed. Once you save here, this page decides.</span>
        </div>
      )}

      <Card padding="px-6 py-2">
        <ul className="divide-y divide-gray-100">
          {licensed.map((m) => (
            <ModuleRow key={m.key} module={m} modules={modules} on={current.has(m.key)} onToggle={toggle} />
          ))}
        </ul>
      </Card>

      {unlicensed.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-1">Not included in this school's licence</h2>
          <p className="text-xs text-gray-500 mb-3">Contact your Shule SMS provider to add these.</p>
          <Card padding="px-6 py-2">
            <ul className="divide-y divide-gray-100">
              {unlicensed.map((m) => (
                <ModuleRow key={m.key} module={m} modules={modules} on={false} onToggle={toggle} />
              ))}
            </ul>
          </Card>
        </div>
      )}

      {dirty && (
        <div className="sticky bottom-4 z-20 rounded-xl border border-gray-200 bg-white/95 backdrop-blur shadow-card px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 min-w-[12rem] text-sm text-gray-600">
              {[
                turningOn.length && `Switching on: ${turningOn.map((m) => m.label).join(', ')}`,
                turningOff.length && `Switching off: ${turningOff.map((m) => m.label).join(', ')}`,
              ].filter(Boolean).join(' · ')}
            </p>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={mut.isPending}>Discard</Button>
            <Button onClick={save} disabled={mut.isPending}>{mut.isPending ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </div>
      )}

      {confirmOff && (
        <Modal isOpen onClose={() => setConfirmOff(null)} title="Switch modules off?" size="sm">
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-700">
              {confirmOff.map((m) => m.label).join(', ')} will be hidden for every user, and{' '}
              {confirmOff.length > 1 ? 'their' : 'its'} scheduled jobs (such as reminders and alerts) will stop.
            </p>
            <p className="text-sm text-gray-500">No records are deleted. Switch it back on at any time to restore it.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmOff(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => mut.mutate()} disabled={mut.isPending}>
                {mut.isPending ? 'Saving…' : 'Switch off'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
