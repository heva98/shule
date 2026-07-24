import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Shield } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { changeRole, getUsers } from '../../api/sysadmin'
import Modal from '../../components/ui/Modal'
import { ROLE_BADGE, ROLE_ICON, ROLE_OPTIONS } from '../../lib/constants'

const initials = (name = '') =>
  name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'

function fmtDate(ts) {
  if (!ts) return 'Never active'
  const d = new Date(ts)
  const diff = Math.floor((Date.now() - d) / 1000)
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString('en-TZ', { day: 'numeric', month: 'short' })
}

export default function RoleAssignmentPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [newRole, setNewRole] = useState(null)
  const [reason, setReason] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const q = useQuery({
    queryKey: ['admin-users-all'],
    queryFn: () => getUsers({ page_size: 200 }),
  })
  const users = (q.data?.results ?? []).filter(u =>
    !search || u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  const mut = useMutation({
    mutationFn: () => changeRole(selected.id, { role: newRole, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users-all'] })
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success(`Role updated to ${newRole}.`)
      setSelected(prev => ({ ...prev, role: newRole }))
      setNewRole(null)
      setReason('')
      setShowConfirm(false)
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail ?? 'Failed to update role.')
      setShowConfirm(false)
    },
  })

  function selectUser(user) {
    setSelected(user)
    setNewRole(user.role)
    setReason('')
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-10rem)]">
      {/* Left — user list */}
      <div className="w-72 shrink-0 bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users…"
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {q.isLoading ? (
            <div className="space-y-2 p-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 bg-gray-100 animate-pulse rounded" />
                    <div className="h-2 bg-gray-100 animate-pulse rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => selectUser(u)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 text-left transition-colors ${
                    selected?.id === u.id ? 'bg-primary/5 border-l-2 border-primary' : ''
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full text-white text-xs font-semibold flex items-center justify-center shrink-0 ${
                    selected?.id === u.id ? 'bg-primary' : 'bg-gray-300'
                  }`}>
                    {initials(u.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{u.full_name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ROLE_BADGE[u.role] ?? 'bg-gray-100 text-gray-500'}`}>
                      {u.role}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(u.last_login)}</span>
                </button>
              ))}
              {users.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">No users found.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right — assignment panel */}
      <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
            <Shield size={40} className="text-gray-200" />
            <p className="text-sm">Select a user to assign a role</p>
          </div>
        ) : (
          <>
            {/* User header */}
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary text-white text-lg font-bold flex items-center justify-center shrink-0">
                  {initials(selected.full_name)}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{selected.full_name}</h2>
                  <p className="text-sm text-gray-500">{selected.email}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-gray-400">Current role:</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[selected.role]}`}>
                      {selected.role}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Role grid */}
            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Select New Role</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {ROLE_OPTIONS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setNewRole(r.value)}
                    className={`relative text-left p-3 rounded-xl border-2 transition-all ${
                      newRole === r.value
                        ? `${r.color} bg-white shadow-sm scale-[1.02]`
                        : selected.role === r.value
                          ? 'border-gray-300 bg-gray-50'
                          : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    {selected.role === r.value && (
                      <span className="absolute top-2 right-2 text-[9px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">
                        current
                      </span>
                    )}
                    <div className="text-xl mb-1">{ROLE_ICON[r.value] ?? '👤'}</div>
                    <div className="text-xs font-semibold text-gray-800">{r.label}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{r.desc}</div>
                  </button>
                ))}
              </div>

              {/* Reason + confirm */}
              {newRole && newRole !== selected.role && (
                <div className="mt-5 space-y-3 border-t border-gray-100 pt-5">
                  <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Changing from <strong>{selected.role}</strong> → <strong>{newRole}</strong>
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Reason (optional)</label>
                    <input
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="Brief reason for role change…"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <button
                    onClick={() => setShowConfirm(true)}
                    className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Confirm Role Change
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Confirm modal */}
      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} title="Confirm Role Change" size="sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to change <strong>{selected?.full_name}</strong>'s role from{' '}
            <strong>{selected?.role}</strong> to <strong>{newRole}</strong>?
          </p>
          <p className="text-xs text-gray-400">This action will be recorded in the audit log.</p>
          <div className="flex gap-3">
            <button onClick={() => setShowConfirm(false)}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={() => mut.mutate()} disabled={mut.isPending}
              className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {mut.isPending ? 'Saving…' : 'Yes, change role'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
