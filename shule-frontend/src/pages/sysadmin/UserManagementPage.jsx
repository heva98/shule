import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Check, ChevronDown, Download, Edit2,
  KeyRound, MoreVertical, RefreshCw, Search, Shield,
  Upload, UserCheck, UserMinus, Users, X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  bulkImport, changeRole, getUsers, resetPassword, toggleActive, updateUser,
} from '../../api/sysadmin'
import Modal from '../../components/ui/Modal'
import AddUserModal from './components/AddUserModal'
import { ROLE_BADGE, ROLE_LABEL, ROLE_OPTIONS } from '../../lib/constants'

// ── Constants ─────────────────────────────────────────────────────────────────

const initials = (name = '') =>
  name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'

function fmtDate(ts) {
  if (!ts) return 'Never'
  return new Date(ts).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Edit user modal ────────────────────────────────────────────────────────────

function EditUserModal({ user, onClose }) {
  const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { full_name: user.full_name, phone: user.phone ?? '' },
  })
  const mut = useMutation({
    mutationFn: (data) => updateUser(user.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('User updated.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed.'),
  })
  return (
    <Modal isOpen title="Edit User" onClose={onClose} size="sm">
      <form onSubmit={handleSubmit(d => mut.mutate(d))} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Full Name</label>
          <input {...register('full_name')}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
          <input
            {...register('phone', {
              validate: v => {
                if (!v) return true
                const n = v.trim().replace(/[\s-]/g, '')
                return /^\+255\d{9}$/.test(n) || 'Use +255 followed by 9 digits (e.g. +255712345678)'
              },
              setValueAs: v => {
                if (!v) return ''
                const n = v.trim().replace(/[\s-]/g, '')
                return /^0\d{9}$/.test(n) ? '+255' + n.slice(1) : n
              },
            })}
            placeholder="+255712345678"
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.phone ? 'border-red-400' : 'border-gray-200'}`}
          />
          {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone.message}</p>}
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={mut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Change role modal ─────────────────────────────────────────────────────────

function ChangeRoleModal({ user, onClose }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState(user.role)
  const [reason, setReason] = useState('')
  const mut = useMutation({
    mutationFn: () => changeRole(user.id, { role: selected, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('Role updated.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed.'),
  })
  return (
    <Modal isOpen title="Change Role" onClose={onClose} size="lg">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-semibold">
            {initials(user.full_name)}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{user.full_name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_BADGE[user.role]}`}>{user.role}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ROLE_OPTIONS.map(r => (
            <button key={r.value} type="button" onClick={() => setSelected(r.value)}
              className={`text-left p-2.5 rounded-lg border-2 transition-colors ${
                selected === r.value ? `${r.color} bg-white font-medium` : 'border-gray-100 text-gray-600 hover:border-gray-200'
              }`}>
              <div className="text-xs font-semibold">{r.label}</div>
              <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{r.desc}</div>
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Reason (optional)</label>
          <input value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Brief reason for role change…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        {selected !== user.role && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Changing from <strong>{user.role}</strong> → <strong>{selected}</strong>
          </p>
        )}
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || selected === user.role}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Confirm Change'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Reset password modal ───────────────────────────────────────────────────────

function ResetPasswordModal({ user, onClose }) {
  const qc = useQueryClient()
  const [pw, setPw] = useState(() => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#'
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  })
  const [notify, setNotify] = useState(true)
  const [copied, setCopied] = useState(false)
  const mut = useMutation({
    mutationFn: () => resetPassword(user.id, { new_password: pw, notify }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('Password reset.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed.'),
  })
  return (
    <Modal isOpen title="Reset Password" onClose={onClose} size="sm">
      <div className="p-6 space-y-4">
        <p className="text-sm text-gray-600">
          Reset password for <strong>{user.full_name}</strong>?
        </p>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">New Password</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm font-mono text-gray-800 break-all">{pw}</code>
            <button onClick={() => navigator.clipboard.writeText(pw).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-500">
              {copied ? <Check size={14} className="text-green-600" /> : <KeyRound size={14} />}
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} className="rounded" />
          Send new password to {user.email}
        </label>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {mut.isPending ? 'Resetting…' : 'Reset Password'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Toggle active confirm ──────────────────────────────────────────────────────

function ToggleActiveModal({ user, onClose }) {
  const qc = useQueryClient()
  const isActive = user.is_active
  const mut = useMutation({
    mutationFn: () => toggleActive(user.id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success(data.detail)
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed.'),
  })
  return (
    <Modal isOpen title={isActive ? 'Deactivate User' : 'Activate User'} onClose={onClose} size="sm">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700">
            {isActive
              ? `Deactivating ${user.full_name} will prevent them from logging in.`
              : `This will re-enable login for ${user.full_name}.`}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className={`flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 ${
              isActive ? 'bg-danger hover:bg-danger/90' : 'bg-success hover:bg-success/90'
            }`}>
            {mut.isPending ? 'Saving…' : isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Bulk import modal ─────────────────────────────────────────────────────────

function BulkImportModal({ onClose }) {
  const qc = useQueryClient()
  const fileRef = useRef()
  const [preview, setPreview] = useState(null)
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [result, setResult] = useState(null)
  const mut = useMutation({
    mutationFn: () => bulkImport(file),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setResult(data)
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Import failed.'),
  })

  function parseCSV(text) {
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim())
    return lines.slice(1, 6).map(line => {
      const vals = line.split(',').map(v => v.trim())
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
    })
  }

  function handleFile(f) {
    if (!f) return
    setFile(f)
    const reader = new FileReader()
    reader.onload = e => setPreview(parseCSV(e.target.result))
    reader.readAsText(f)
  }

  function downloadTemplate() {
    const csv = 'full_name,email,phone,role\nAmina Hassan,amina@school.tz,+255712345678,TEACHER\n'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'user_import_template.csv'
    a.click()
  }

  if (result) {
    return (
      <Modal isOpen title="Import Results" onClose={onClose} size="sm">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-green-600">{result.created}</p>
              <p className="text-xs text-green-600 mt-1">Created</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-yellow-600">{result.skipped}</p>
              <p className="text-xs text-yellow-600 mt-1">Skipped</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-red-600">{result.errors}</p>
              <p className="text-xs text-red-600 mt-1">Errors</p>
            </div>
          </div>
          {result.error_details?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-red-700 mb-2">Errors</p>
              {result.error_details.map((e, i) => (
                <p key={i} className="text-xs text-red-600">Row {e.row}: {e.reason}</p>
              ))}
            </div>
          )}
          <button onClick={onClose}
            className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium">Done</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen title="Bulk Import Users" onClose={onClose} size="md">
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">Upload a CSV with columns: full_name, email, phone, role</p>
          <button onClick={downloadTemplate}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline">
            <Download size={13} /> Template
          </button>
        </div>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => fileRef.current.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <Upload size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">{file ? file.name : 'Drop CSV here or click to browse'}</p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files[0])} />
        </div>

        {preview && (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {Object.keys(preview[0]).map(h => (
                    <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="px-3 py-2 text-gray-700">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-gray-400 px-3 py-1.5">Showing first 5 rows preview</p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!file || mut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {mut.isPending ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Row action menu ───────────────────────────────────────────────────────────

function RowMenu({ user, onEdit, onRole, onReset, onToggle }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(p => !p)}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 transition-colors">
        <MoreVertical size={15} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-44 bg-white border border-gray-100 rounded-xl shadow-lg py-1 text-sm">
            <button onClick={() => { setOpen(false); onEdit() }}
              className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 text-gray-700">
              <Edit2 size={13} /> Edit details
            </button>
            <button onClick={() => { setOpen(false); onRole() }}
              className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 text-gray-700">
              <Shield size={13} /> Change role
            </button>
            <button onClick={() => { setOpen(false); onReset() }}
              className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 text-gray-700">
              <KeyRound size={13} /> Reset password
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button onClick={() => { setOpen(false); onToggle() }}
              className={`flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 ${
                user.is_active ? 'text-danger' : 'text-success'
              }`}>
              {user.is_active ? <UserMinus size={13} /> : <UserCheck size={13} />}
              {user.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UserManagementPage() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showAdd, setShowAdd] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [roleUser, setRoleUser] = useState(null)
  const [resetUser, setResetUser] = useState(null)
  const [toggleUser, setToggleUser] = useState(null)

  const qParams = {
    search: search || undefined,
    role: roleFilter || undefined,
    is_active: statusFilter || undefined,
    page,
    page_size: 20,
  }
  const q = useQuery({ queryKey: ['admin-users', qParams], queryFn: () => getUsers(qParams) })
  const users = q.data?.results ?? []
  const total = q.data?.count ?? 0

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1) }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none">
          <option value="">All roles</option>
          {[...ROLE_OPTIONS.map(r => r.value), 'STUDENT'].map(r => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none">
          <option value="">All status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <button onClick={() => setShowBulk(true)}
          className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <Upload size={14} /> Bulk Import
        </button>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
          <Users size={14} /> Add User
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden md:table-cell">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden lg:table-cell">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden xl:table-cell">Last Login</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {q.isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 animate-pulse rounded w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary text-white text-xs font-semibold flex items-center justify-center shrink-0">
                          {initials(user.full_name)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800 whitespace-nowrap">{user.full_name}</p>
                          <p className="text-xs text-gray-400 md:hidden">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{user.email}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">{user.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 hidden xl:table-cell">
                      {fmtDate(user.last_login)}
                    </td>
                    <td className="px-4 py-3">
                      <RowMenu
                        user={user}
                        onEdit={() => setEditUser(user)}
                        onRole={() => setRoleUser(user)}
                        onReset={() => setResetUser(user)}
                        onToggle={() => setToggleUser(user)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            <span>{total} total users</span>
            <div className="flex items-center gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">Prev</button>
              <span>Page {page} of {Math.ceil(total / 20)}</span>
              <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AddUserModal isOpen={showAdd} onClose={() => setShowAdd(false)} />
      {showBulk && <BulkImportModal onClose={() => setShowBulk(false)} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} />}
      {roleUser && <ChangeRoleModal user={roleUser} onClose={() => setRoleUser(null)} />}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
      {toggleUser && <ToggleActiveModal user={toggleUser} onClose={() => setToggleUser(null)} />}
    </div>
  )
}
