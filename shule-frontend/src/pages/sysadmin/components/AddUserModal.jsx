import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { createUser } from '../../../api/sysadmin'
import Modal from '../../../components/ui/Modal'

export const ROLES = [
  { value: 'OWNER',              label: 'Owner',              desc: 'Full system access',            color: 'border-purple-300 text-purple-700' },
  { value: 'SYSTEM_ADMIN',       label: 'System Admin',       desc: 'System configuration & users',  color: 'border-red-300 text-red-700' },
  { value: 'HEADTEACHER',        label: 'Headteacher',        desc: 'School administration & oversight', color: 'border-blue-900/40 text-blue-900' },
  { value: 'ACADEMIC_TEACHER',   label: 'Academic Teacher',   desc: 'Academic coordination',         color: 'border-orange-300 text-orange-700' },
  { value: 'DISCIPLINE_TEACHER', label: 'Discipline Teacher', desc: 'Disciplinary management',       color: 'border-purple-300 text-purple-600' },
  { value: 'CLASS_TEACHER',      label: 'Class Teacher',      desc: 'Class register & marks',        color: 'border-green-300 text-green-700' },
  { value: 'SUBJECT_TEACHER',    label: 'Subject Teacher',    desc: 'Mark entry for subjects',       color: 'border-teal-300 text-teal-700' },
  { value: 'TEACHER',            label: 'Teacher',            desc: 'General (legacy role)',          color: 'border-sky-300 text-sky-700' },
  { value: 'BURSAR',             label: 'Bursar',             desc: 'Fees & finance management',     color: 'border-yellow-300 text-yellow-700' },
  { value: 'PARENT',             label: 'Parent',             desc: 'View children\'s records',      color: 'border-gray-300 text-gray-600' },
]

function genPassword(len = 12) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function AddUserModal({ isOpen, onClose }) {
  const qc = useQueryClient()
  const [autoPassword, setAutoPassword] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm({
    defaultValues: { role: 'TEACHER', password: genPassword() },
  })
  const selectedRole = watch('role')

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setResult({ user: data, password: watch('password') })
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail ?? 'Failed to create user.')
    },
  })

  function onSubmit(values) {
    const payload = { ...values }
    if (autoPassword) payload.password = watch('password')
    mutation.mutate(payload)
  }

  function handleClose() {
    reset({ role: 'TEACHER', password: genPassword() })
    setResult(null)
    setAutoPassword(true)
    setCopied(false)
    onClose()
  }

  function copyPassword() {
    navigator.clipboard.writeText(result.password).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (result) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="User Created" size="sm">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mx-auto">
            <Check size={22} className="text-green-600" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900">{result.user.full_name}</p>
            <p className="text-sm text-gray-500">{result.user.email}</p>
            <span className="inline-block mt-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {result.user.role}
            </span>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Temporary Password</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-gray-800 break-all">{result.password}</code>
              <button
                onClick={copyPassword}
                className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors"
              >
                {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center">Share this password securely. The user should change it on first login.</p>
          <button
            onClick={handleClose}
            className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Done
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add New User" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
        {/* Basic info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Full Name *</label>
            <input
              {...register('full_name', { required: 'Full name is required' })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. Amina Hassan"
            />
            {errors.full_name && <p className="text-xs text-danger mt-1">{errors.full_name.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
            <input
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' },
              })}
              type="email"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="email@school.tz"
            />
            {errors.email && <p className="text-xs text-danger mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
            <input
              {...register('phone')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="+255 7XX XXX XXX"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={autoPassword}
                  onChange={e => {
                    setAutoPassword(e.target.checked)
                    if (e.target.checked) setValue('password', genPassword())
                  }}
                  className="rounded"
                />
                Auto-generate password
              </label>
              {!autoPassword && (
                <div className="relative">
                  <input
                    {...register('password', { required: 'Password required', minLength: { value: 8, message: 'Min 8 characters' } })}
                    type={showPassword ? 'text' : 'password'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-9 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button type="button" onClick={() => setShowPassword(p => !p)}
                    className="absolute right-2.5 top-2.5 text-gray-400">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              )}
              {autoPassword && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                  <code className="text-xs font-mono text-gray-700 flex-1">{watch('password')}</code>
                  <button type="button" onClick={() => setValue('password', genPassword())}
                    className="text-xs text-primary hover:underline">Refresh</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Role selector */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Role *</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ROLES.map(r => (
              <button
                key={r.value}
                type="button"
                onClick={() => setValue('role', r.value)}
                className={`text-left p-2.5 rounded-lg border-2 transition-colors ${
                  selectedRole === r.value
                    ? `${r.color} bg-white font-medium`
                    : 'border-gray-100 text-gray-600 hover:border-gray-200'
                }`}
              >
                <div className="text-xs font-semibold">{r.label}</div>
                <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{r.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={handleClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
