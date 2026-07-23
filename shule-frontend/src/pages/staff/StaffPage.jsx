import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Briefcase, Calendar, ChevronDown, ChevronRight,
  Edit2, GraduationCap, Mail, Phone, Plus,
  Search, Shield, User, X,
} from 'lucide-react'
import api from '../../lib/axios'
import { useAuth } from '../../context/AuthContext'
import { useSchoolLevels } from '../../hooks/useSchoolLevels'
import {
  approveLeave, createLeaveRequest, createStaff,
  getLeaveRequests, getStaff, rejectLeave, updateStaff,
} from '../../api/staff'
import { getSubjects } from '../../api/exams'

// ─── Constants ────────────────────────────────────────────────────────────────

const DESIG = [
  { value: 'TEACHER', label: 'Teacher' },
  { value: 'HOD', label: 'Head of Department' },
  { value: 'DEPUTY_HEAD', label: 'Deputy Headteacher' },
  { value: 'HEADTEACHER', label: 'Headteacher' },
  { value: 'BURSAR', label: 'Bursar' },
  { value: 'ADMIN', label: 'Administration' },
]
const DESIG_LABEL = Object.fromEntries(DESIG.map(o => [o.value, o.label]))
const DESIG_CLR = {
  TEACHER: 'bg-blue-100 text-blue-700',
  HOD: 'bg-purple-100 text-purple-700',
  DEPUTY_HEAD: 'bg-indigo-100 text-indigo-700',
  HEADTEACHER: 'bg-[#1B4F72]/10 text-[#1B4F72]',
  BURSAR: 'bg-emerald-100 text-emerald-700',
  ADMIN: 'bg-orange-100 text-orange-700',
}

const CONTRACT = [
  { value: 'PERMANENT', label: 'Permanent' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'PART_TIME', label: 'Part-Time' },
]
const CONTRACT_LABEL = Object.fromEntries(CONTRACT.map(o => [o.value, o.label]))
const CONTRACT_CLR = {
  PERMANENT: 'bg-emerald-100 text-emerald-700',
  CONTRACT: 'bg-amber-100 text-amber-700',
  PART_TIME: 'bg-sky-100 text-sky-700',
}

const LEAVE_TYPES = [
  { value: 'ANNUAL', label: 'Annual Leave' },
  { value: 'SICK', label: 'Sick Leave' },
  { value: 'MATERNITY', label: 'Maternity Leave' },
  { value: 'PATERNITY', label: 'Paternity Leave' },
  { value: 'UNPAID', label: 'Unpaid Leave' },
]
const LEAVE_TYPE_LABEL = Object.fromEntries(LEAVE_TYPES.map(o => [o.value, o.label]))
const LEAVE_STATUS_CLR = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
}

// Individual levels — filtered at runtime by useSchoolLevels() inside ProfileFields

const ROLES = [
  { value: 'TEACHER', label: 'Teacher' },
  { value: 'HEADTEACHER', label: 'Headteacher' },
  { value: 'BURSAR', label: 'Bursar' },
  { value: 'WARDEN', label: 'Warden' },
  { value: 'LIBRARIAN', label: 'Librarian' },
  { value: 'OWNER', label: 'Owner' },
]

// ─── Utilities ────────────────────────────────────────────────────────────────

const initials = (name = '') =>
  name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'

const fmtDate = d =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const fmtCurrency = v => (v ? `TZS ${Number(v).toLocaleString()}` : '—')

const daysBetween = (s, e) => {
  if (!s || !e) return 0
  return Math.max(Math.round((new Date(e) - new Date(s)) / 86400000) + 1, 1)
}

// ─── Primitives ───────────────────────────────────────────────────────────────

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/30 focus:border-[#1B4F72]'
const selectCls = `${inputCls} bg-white`

function Bdg({ cls = '', children }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {children}
    </span>
  )
}

function SecHdr({ children }) {
  return (
    <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
      {children}
    </h3>
  )
}

function F({ label, req, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}
        {req && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="mt-0.5 text-gray-400 shrink-0">{icon}</span>}
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <div className="text-sm font-medium text-gray-800">{value ?? '—'}</div>
      </div>
    </div>
  )
}

// ─── SubjectsDropdown ─────────────────────────────────────────────────────────

function SubjectsDropdown({ value, onChange, subjects }) {
  const [open, setOpen] = useState(false)
  const selected = subjects.filter(s => value.includes(s.id))
  const toggle = id =>
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${inputCls} flex items-center justify-between text-left`}
      >
        <span className="truncate">
          {selected.length ? (
            selected.map(s => s.code).join(', ')
          ) : (
            <span className="text-gray-400">Select subjects…</span>
          )}
        </span>
        <ChevronDown size={14} className="shrink-0 text-gray-400 ml-2" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {subjects.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">No subjects available</p>
          ) : (
            subjects.map(s => (
              <label key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value.includes(s.id)}
                  onChange={() => toggle(s.id)}
                  className="rounded accent-[#1B4F72]"
                />
                <span className="text-sm">{s.code} — {s.name}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── QualificationsBuilder ────────────────────────────────────────────────────

const DEGREE_OPTIONS = [
  'Masters Degree',
  'Bachelor Degree',
  'Diploma',
  'Certificate',
  'Form Six',
  'Form Four',
]

const YEAR_OPTIONS = (() => {
  const current = new Date().getFullYear()
  const years = []
  for (let y = current; y >= 1970; y--) years.push(y)
  return years
})()

function QualificationsBuilder({ value, onChange }) {
  const add = () => onChange([...value, { degree: '', program: '', institution: '', year_completed: '' }])
  const remove = i => onChange(value.filter((_, j) => j !== i))
  const upd = (i, k, v) => {
    const n = [...value]
    n[i] = { ...n[i], [k]: v }
    onChange(n)
  }

  return (
    <div className="space-y-3">
      {value.map((q, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1 grid grid-cols-2 gap-2">
            <select
              className={inputCls}
              value={q.degree}
              onChange={e => upd(i, 'degree', e.target.value)}
            >
              <option value="">— Select qualification —</option>
              {DEGREE_OPTIONS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select
              className={inputCls}
              value={q.year_completed}
              onChange={e => upd(i, 'year_completed', e.target.value)}
            >
              <option value="">— Year completed —</option>
              {YEAR_OPTIONS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <input
              className={inputCls}
              placeholder="Program / Course name"
              value={q.program}
              onChange={e => upd(i, 'program', e.target.value)}
            />
            <input
              className={inputCls}
              placeholder="Institution"
              value={q.institution}
              onChange={e => upd(i, 'institution', e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            className="mt-2 text-gray-400 hover:text-red-500"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs text-[#1B4F72] hover:underline flex items-center gap-1"
      >
        <Plus size={12} /> Add qualification
      </button>
    </div>
  )
}

// ─── ProfileFields ────────────────────────────────────────────────────────────

function ProfileFields({ form, set, subjects }) {
  const { levelGroups, levelOptions } = useSchoolLevels()
  const levels = ['', ...levelOptions.map(o => o.value)]
  const [ecPhoneErr, setEcPhoneErr] = useState('')

  function handleEcPhone(v) {
    setEcPhoneErr('')
    set('emergency_contact_phone', v)
  }

  function validateEcPhone() {
    if (!form.emergency_contact_phone) return
    const n = form.emergency_contact_phone.trim().replace(/[\s-]/g, '')
    const norm = /^0\d{9}$/.test(n) ? '+255' + n.slice(1) : n
    if (!/^\+255\d{9}$/.test(norm)) {
      setEcPhoneErr('Use +255 followed by 9 digits (e.g. +255712345678)')
    } else {
      set('emergency_contact_phone', norm)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <SecHdr>Professional</SecHdr>
        <div className="grid grid-cols-2 gap-4">
          <F label="Designation" req>
            <select className={selectCls} required value={form.designation}
              onChange={e => set('designation', e.target.value)}>
              {DESIG.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </F>
          <F label="Contract Type" req>
            <select className={selectCls} required value={form.contract_type}
              onChange={e => set('contract_type', e.target.value)}>
              {CONTRACT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </F>
          <F label="Hire Date" req>
            <input className={inputCls} type="date" required value={form.hire_date}
              onChange={e => set('hire_date', e.target.value)} />
          </F>
          <F label="TSC Number">
            <input className={inputCls} value={form.tsc_number}
              onChange={e => set('tsc_number', e.target.value)} placeholder="TSC-XXXXX" />
          </F>
          <F label="Basic Salary (TZS)">
            <input className={inputCls} type="number" value={form.basic_salary}
              onChange={e => set('basic_salary', e.target.value)} placeholder="0" />
          </F>
          <F label="National ID">
            <input className={inputCls} value={form.national_id}
              onChange={e => set('national_id', e.target.value)} />
          </F>
        </div>
      </div>

      <div>
        <SecHdr>Subjects Taught</SecHdr>
        <SubjectsDropdown value={form.subjects} onChange={v => set('subjects', v)} subjects={subjects} />
      </div>

      <div>
        <SecHdr>Class Teacher Assignment <span className="font-normal text-gray-400 normal-case">(optional)</span></SecHdr>
        <div className="grid grid-cols-2 gap-4">
          <F label="Level">
            <select className={selectCls} value={form.class_teacher_of_level}
              onChange={e => set('class_teacher_of_level', e.target.value)}>
              {levels.map(l => <option key={l} value={l}>{l || '— None —'}</option>)}
            </select>
          </F>
          <F label="Stream">
            <input className={inputCls} value={form.class_teacher_of_stream}
              onChange={e => set('class_teacher_of_stream', e.target.value)}
              placeholder="e.g. A, B, Science" />
          </F>
        </div>
      </div>

      <div>
        <SecHdr>School Levels</SecHdr>
        <p className="text-xs text-gray-400 mb-3">Select the level groups this staff member works with. Leave all unchecked if they work across all levels.</p>
        <div className="flex flex-wrap gap-2">
          {levelGroups.map(lg => {
            const checked = (form.taught_levels || []).includes(lg.value)
            return (
              <button
                key={lg.value}
                type="button"
                onClick={() => {
                  const current = form.taught_levels || []
                  set('taught_levels', checked ? current.filter(v => v !== lg.value) : [...current, lg.value])
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm transition-colors ${
                  checked
                    ? 'border-[#1B4F72] bg-[#1B4F72]/5 text-[#1B4F72] font-medium'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                  checked ? 'border-[#1B4F72] bg-[#1B4F72]' : 'border-gray-300'
                }`}>
                  {checked && <svg viewBox="0 0 10 8" className="w-2.5 h-2"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                {lg.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <SecHdr>Emergency Contact</SecHdr>
        <div className="grid grid-cols-2 gap-4">
          <F label="Name">
            <input className={inputCls} value={form.emergency_contact_name}
              onChange={e => set('emergency_contact_name', e.target.value)} />
          </F>
          <F label="Phone">
            <input
              className={`${inputCls} ${ecPhoneErr ? 'border-red-400 focus:ring-red-200 focus:border-red-400' : ''}`}
              value={form.emergency_contact_phone}
              onChange={e => handleEcPhone(e.target.value)}
              onBlur={validateEcPhone}
              placeholder="+255712345678"
              maxLength={13}
            />
            {ecPhoneErr && <p className="text-xs text-red-500 mt-1">{ecPhoneErr}</p>}
          </F>
        </div>
      </div>

      <div>
        <SecHdr>Qualifications</SecHdr>
        <QualificationsBuilder value={form.qualifications} onChange={v => set('qualifications', v)} />
      </div>
    </div>
  )
}

// ─── AddStaffModal ────────────────────────────────────────────────────────────

const BLANK_PROFILE = {
  designation: 'TEACHER', tsc_number: '', hire_date: '', contract_type: 'PERMANENT',
  basic_salary: '', national_id: '', class_teacher_of_level: '', class_teacher_of_stream: '',
  subjects: [], taught_levels: [], qualifications: [], emergency_contact_name: '', emergency_contact_phone: '',
}

function AddStaffModal({ onClose }) {
  const qc = useQueryClient()
  const { data: subjectData } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => getSubjects({ all: 'true' }),
  })
  const subjects = Array.isArray(subjectData) ? subjectData : (subjectData?.results ?? [])

  const [step, setStep] = useState(1)
  const [createdUserId, setCreatedUserId] = useState(null)
  const [account, setAccount] = useState({
    full_name: '', email: '', phone: '', password: '', role: 'TEACHER',
  })
  const [profile, setProfile] = useState(BLANK_PROFILE)
  const [loading, setLoading] = useState(false)
  const [phoneError, setPhoneError] = useState('')

  const setA = (k, v) => setAccount(a => ({ ...a, [k]: v }))
  const setP = (k, v) => setProfile(p => ({ ...p, [k]: v }))

  function normalizePhone(v) {
    const n = v.trim().replace(/[\s-]/g, '')
    return /^0\d{9}$/.test(n) ? '+255' + n.slice(1) : n
  }

  async function handleStep1(e) {
    e.preventDefault()
    if (account.phone) {
      const normalized = normalizePhone(account.phone)
      if (!/^\+255\d{9}$/.test(normalized)) {
        setPhoneError('Use +255 followed by 9 digits (e.g. +255712345678)')
        return
      }
      setAccount(a => ({ ...a, phone: normalized }))
    }
    setLoading(true)
    try {
      const res = await api.post('/auth/register/', { ...account, phone: account.phone ? normalizePhone(account.phone) : '' })
      setCreatedUserId(res.data.user.id)
      setStep(2)
    } catch (err) {
      const d = err.response?.data
      const msg = d?.email?.[0] || d?.detail || 'Failed to create user account'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleStep2(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const qualifications = profile.qualifications.filter(q => q.degree && q.institution && q.year_completed)
      await createStaff({
        user: createdUserId,
        ...profile,
        basic_salary: profile.basic_salary || 0,
        qualifications,
      })
      toast.success('Staff member added')
      qc.invalidateQueries({ queryKey: ['staff'] })
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create staff profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">Add Staff Member</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Step {step} of 2 — {step === 1 ? 'Account Setup' : 'Professional Profile'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-2 px-5 pt-4">
          {[1, 2].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-[#1B4F72]' : 'bg-gray-200'}`} />
          ))}
        </div>

        {step === 1 ? (
          <form onSubmit={handleStep1} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <F label="Full Name" req>
                <input className={inputCls} required value={account.full_name}
                  onChange={e => setA('full_name', e.target.value)} placeholder="e.g. Jane Doe" />
              </F>
              <F label="System Role" req>
                <select className={selectCls} value={account.role}
                  onChange={e => setA('role', e.target.value)}>
                  {ROLES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </F>
              <F label="Email Address" req>
                <input className={inputCls} type="email" required value={account.email}
                  onChange={e => setA('email', e.target.value)} placeholder="jane@shule.ac.tz" />
              </F>
              <F label="Phone Number">
                <input
                  className={`${inputCls} ${phoneError ? 'border-red-400 focus:ring-red-200 focus:border-red-400' : ''}`}
                  value={account.phone}
                  onChange={e => { setPhoneError(''); setA('phone', e.target.value) }}
                  placeholder="+255712345678"
                  maxLength={13}
                />
                {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
              </F>
              <div className="col-span-2">
                <F label="Temporary Password" req>
                  <input className={inputCls} type="password" required minLength={8}
                    value={account.password} onChange={e => setA('password', e.target.value)}
                    placeholder="Minimum 8 characters" />
                </F>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="px-4 py-2 text-sm bg-[#1B4F72] text-white rounded-lg hover:bg-[#154060] disabled:opacity-60">
                {loading ? 'Creating…' : 'Next →'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleStep2}>
            <div className="p-5 max-h-[62vh] overflow-y-auto">
              <ProfileFields form={profile} set={setP} subjects={subjects} />
            </div>
            <div className="flex justify-between p-5 border-t">
              <button type="button" onClick={() => setStep(1)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                ← Back
              </button>
              <button type="submit" disabled={loading}
                className="px-4 py-2 text-sm bg-[#1B4F72] text-white rounded-lg hover:bg-[#154060] disabled:opacity-60">
                {loading ? 'Saving…' : 'Add Staff Member'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── StaffModal (view + edit) ─────────────────────────────────────────────────

function StaffModal({ staff, canEdit, onClose }) {
  const qc = useQueryClient()
  const { data: subjectData } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => getSubjects({ all: 'true' }),
  })
  const subjects = Array.isArray(subjectData) ? subjectData : (subjectData?.results ?? [])

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    designation: staff.designation || 'TEACHER',
    tsc_number: staff.tsc_number || '',
    hire_date: staff.hire_date || '',
    contract_type: staff.contract_type || 'PERMANENT',
    basic_salary: staff.basic_salary || '',
    national_id: staff.national_id || '',
    class_teacher_of_level: staff.class_teacher_of_level || '',
    class_teacher_of_stream: staff.class_teacher_of_stream || '',
    subjects: (staff.subjects_display || []).map(s => s.id),
    taught_levels: staff.taught_levels || [],
    qualifications: staff.qualifications || [],
    emergency_contact_name: staff.emergency_contact_name || '',
    emergency_contact_phone: staff.emergency_contact_phone || '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: data => updateStaff(staff.id, data),
    onSuccess: () => {
      toast.success('Staff profile updated')
      qc.invalidateQueries({ queryKey: ['staff'] })
      setEditing(false)
    },
    onError: err => toast.error(err.response?.data?.detail || 'Update failed'),
  })

  function handleSave(e) {
    e.preventDefault()
    const qualifications = form.qualifications.filter(q => q.degree && q.institution && q.year_completed)
    mutation.mutate({ ...form, basic_salary: form.basic_salary || 0, qualifications })
  }

  const photo = staff.user_detail?.profile_photo

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#1B4F72] flex items-center justify-center text-white font-semibold text-sm overflow-hidden shrink-0">
              {photo
                ? <img src={photo} className="w-full h-full object-cover" alt="" />
                : initials(staff.full_name)}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{staff.full_name}</p>
              <p className="text-xs text-gray-500">{staff.employee_id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Edit2 size={14} /> Edit
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
        </div>

        {editing ? (
          <form onSubmit={handleSave}>
            <div className="p-5 max-h-[62vh] overflow-y-auto">
              <ProfileFields form={form} set={set} subjects={subjects} />
            </div>
            <div className="flex justify-between p-5 border-t">
              <button type="button" onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={mutation.isPending}
                className="px-4 py-2 text-sm bg-[#1B4F72] text-white rounded-lg hover:bg-[#154060] disabled:opacity-60">
                {mutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-5 max-h-[70vh] overflow-y-auto space-y-5">
            <div>
              <SecHdr>Contact</SecHdr>
              <div className="grid grid-cols-2 gap-3">
                <InfoRow icon={<Mail size={14} />} label="Email" value={staff.email || '—'} />
                <InfoRow icon={<Phone size={14} />} label="Phone" value={staff.phone || '—'} />
              </div>
            </div>

            <div>
              <SecHdr>Professional</SecHdr>
              <div className="grid grid-cols-3 gap-3">
                <InfoRow label="Designation"
                  value={<Bdg cls={DESIG_CLR[staff.designation]}>{DESIG_LABEL[staff.designation] || staff.designation}</Bdg>} />
                <InfoRow label="Contract"
                  value={<Bdg cls={CONTRACT_CLR[staff.contract_type]}>{CONTRACT_LABEL[staff.contract_type] || staff.contract_type}</Bdg>} />
                <InfoRow label="Hire Date" value={fmtDate(staff.hire_date)} />
                <InfoRow label="TSC Number" value={staff.tsc_number || '—'} />
                <InfoRow label="Basic Salary" value={fmtCurrency(staff.basic_salary)} />
                <InfoRow label="National ID" value={staff.national_id || '—'} />
                {staff.class_teacher_of_level && (
                  <InfoRow label="Class Teacher"
                    value={`${staff.class_teacher_of_level}${staff.class_teacher_of_stream ? ' ' + staff.class_teacher_of_stream : ''}`} />
                )}
              </div>
            </div>

            {staff.subjects_display?.length > 0 && (
              <div>
                <SecHdr>Subjects Taught</SecHdr>
                <div className="flex flex-wrap gap-1.5">
                  {staff.subjects_display.map(s => (
                    <Bdg key={s.id} cls="bg-blue-100 text-blue-700">{s.code} — {s.name}</Bdg>
                  ))}
                </div>
              </div>
            )}

            {(staff.emergency_contact_name || staff.emergency_contact_phone) && (
              <div>
                <SecHdr>Emergency Contact</SecHdr>
                <div className="grid grid-cols-2 gap-3">
                  <InfoRow label="Name" value={staff.emergency_contact_name || '—'} />
                  <InfoRow label="Phone" value={staff.emergency_contact_phone || '—'} />
                </div>
              </div>
            )}

            {staff.qualifications?.length > 0 && (
              <div>
                <SecHdr>Qualifications</SecHdr>
                <ul className="space-y-1.5">
                  {staff.qualifications.map((q, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <GraduationCap size={14} className="mt-0.5 shrink-0 text-gray-400" />
                      <span>
                        {q.degree}{q.program ? ` — ${q.program}` : ''} · {q.institution} ({q.year_completed})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── NewLeaveModal ────────────────────────────────────────────────────────────

function NewLeaveModal({ staffList, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    staff: '', leave_type: 'ANNUAL', start_date: '', end_date: '', reason: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const days = daysBetween(form.start_date, form.end_date)

  const mutation = useMutation({
    mutationFn: data => createLeaveRequest(data),
    onSuccess: () => {
      toast.success('Leave request submitted')
      qc.invalidateQueries({ queryKey: ['leave'] })
      onClose()
    },
    onError: err => toast.error(err.response?.data?.detail || 'Submission failed'),
  })

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.staff) { toast.error('Please select a staff member'); return }
    mutation.mutate({ ...form, days_requested: days })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-gray-900">New Leave Request</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <F label="Staff Member" req>
            <select className={selectCls} required value={form.staff}
              onChange={e => set('staff', e.target.value)}>
              <option value="">— Select staff —</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>{s.full_name} ({s.employee_id})</option>
              ))}
            </select>
          </F>
          <F label="Leave Type" req>
            <select className={selectCls} required value={form.leave_type}
              onChange={e => set('leave_type', e.target.value)}>
              {LEAVE_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </F>
          <div className="grid grid-cols-2 gap-4">
            <F label="Start Date" req>
              <input className={inputCls} type="date" required value={form.start_date}
                onChange={e => set('start_date', e.target.value)} />
            </F>
            <F label="End Date" req>
              <input className={inputCls} type="date" required value={form.end_date}
                min={form.start_date} onChange={e => set('end_date', e.target.value)} />
            </F>
          </div>
          {days > 0 && (
            <p className="text-xs text-gray-500 -mt-2">
              {days} day{days !== 1 ? 's' : ''} requested
            </p>
          )}
          <F label="Reason" req>
            <textarea className={`${inputCls} resize-none`} required rows={3} value={form.reason}
              onChange={e => set('reason', e.target.value)} placeholder="Brief reason for leave…" />
          </F>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="px-4 py-2 text-sm bg-[#1B4F72] text-white rounded-lg hover:bg-[#154060] disabled:opacity-60">
              {mutation.isPending ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── StaffDirectoryTab ────────────────────────────────────────────────────────

function StaffDirectoryTab({ canEdit }) {
  const [search, setSearch] = useState('')
  const [desigFilter, setDesigFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['staff', search],
    queryFn: () => getStaff({ search: search || undefined }),
  })
  const staff = data?.results ?? []
  const total = data?.count ?? 0

  const displayed = desigFilter ? staff.filter(s => s.designation === desigFilter) : staff

  const teachers = staff.filter(s => s.designation === 'TEACHER').length
  const hods = staff.filter(s => s.designation === 'HOD').length

  return (
    <div>
      {showAdd && <AddStaffModal onClose={() => setShowAdd(false)} />}
      {selected && (
        <StaffModal staff={selected} canEdit={canEdit} onClose={() => setSelected(null)} />
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Staff', value: total, icon: <User size={16} />, clr: 'text-[#1B4F72]', bg: 'bg-[#1B4F72]/5' },
          { label: 'Teachers', value: teachers, icon: <Briefcase size={16} />, clr: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Dept. Heads', value: hods, icon: <Shield size={16} />, clr: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Subjects', value: '—', icon: <GraduationCap size={16} />, clr: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(stat => (
          <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg ${stat.bg} ${stat.clr} text-xs font-medium mb-2`}>
              {stat.icon}
              {stat.label}
            </div>
            <p className="text-2xl font-bold text-gray-900">{isLoading ? '…' : stat.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/30 focus:border-[#1B4F72]"
            placeholder="Search by name, employee ID, TSC…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/30 w-full sm:w-44"
          value={desigFilter}
          onChange={e => setDesigFilter(e.target.value)}
        >
          <option value="">All Designations</option>
          {DESIG.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {canEdit && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-[#1B4F72] text-white text-sm rounded-lg hover:bg-[#154060] whitespace-nowrap"
          >
            <Plus size={16} /> Add Staff
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading staff…</div>
        ) : displayed.length === 0 ? (
          <div className="p-10 text-center">
            <Briefcase size={36} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No staff found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Staff Member
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Designation
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  Subjects
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Contract
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  Hired
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.map(s => (
                <tr
                  key={s.id}
                  onClick={() => setSelected(s)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#1B4F72] flex items-center justify-center text-white text-xs font-semibold shrink-0">
                        {initials(s.full_name)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{s.full_name}</p>
                        <p className="text-xs text-gray-400">{s.employee_id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Bdg cls={DESIG_CLR[s.designation] || 'bg-gray-100 text-gray-600'}>
                      {DESIG_LABEL[s.designation] || s.designation}
                    </Bdg>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-xs">
                    {s.subjects_display?.slice(0, 3).map(sub => sub.code).join(', ') || '—'}
                    {s.subjects_display?.length > 3 && ` +${s.subjects_display.length - 3}`}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Bdg cls={CONTRACT_CLR[s.contract_type] || 'bg-gray-100 text-gray-600'}>
                      {CONTRACT_LABEL[s.contract_type] || s.contract_type}
                    </Bdg>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-500">
                    {fmtDate(s.hire_date)}
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight size={16} className="text-gray-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && total > staff.length && (
          <div className="px-4 py-3 border-t text-xs text-gray-500 text-center bg-gray-50">
            Showing {staff.length} of {total} staff members
          </div>
        )}
      </div>
    </div>
  )
}

// ─── LeaveTab ─────────────────────────────────────────────────────────────────

function LeaveTab({ canApprove, allStaff }) {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [showNew, setShowNew] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['leave', statusFilter],
    queryFn: () => getLeaveRequests(statusFilter ? { status: statusFilter } : {}),
  })
  const leaves = data?.results ?? []

  const approveMut = useMutation({
    mutationFn: id => approveLeave(id),
    onSuccess: () => { toast.success('Leave approved'); qc.invalidateQueries({ queryKey: ['leave'] }) },
    onError: err => toast.error(err.response?.data?.detail || 'Approval failed'),
  })
  const rejectMut = useMutation({
    mutationFn: id => rejectLeave(id),
    onSuccess: () => { toast.success('Leave rejected'); qc.invalidateQueries({ queryKey: ['leave'] }) },
    onError: err => toast.error(err.response?.data?.detail || 'Rejection failed'),
  })

  const STATUS_TABS = [
    { value: '', label: 'All' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
  ]

  return (
    <div>
      {showNew && <NewLeaveModal staffList={allStaff} onClose={() => setShowNew(false)} />}

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {STATUS_TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setStatusFilter(t.value)}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                statusFilter === t.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {canApprove && (
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1B4F72] text-white text-sm rounded-lg hover:bg-[#154060]"
          >
            <Plus size={16} /> New Request
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading leave requests…</div>
        ) : leaves.length === 0 ? (
          <div className="p-10 text-center">
            <Calendar size={36} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No leave requests</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Period</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Days</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden xl:table-cell">Reason</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                {canApprove && (
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leaves.map(lv => (
                <tr key={lv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{lv.staff_name}</p>
                    <p className="text-xs text-gray-400">{lv.employee_id}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-700">
                    {LEAVE_TYPE_LABEL[lv.leave_type] || lv.leave_type}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-gray-600">
                    {fmtDate(lv.start_date)} → {fmtDate(lv.end_date)}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-center font-medium text-gray-700">
                    {lv.days_requested}
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell text-gray-600 max-w-xs">
                    <p className="truncate">{lv.reason}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Bdg cls={LEAVE_STATUS_CLR[lv.status] || 'bg-gray-100 text-gray-600'}>
                      {lv.status}
                    </Bdg>
                  </td>
                  {canApprove && (
                    <td className="px-4 py-3 text-right">
                      {lv.status === 'PENDING' ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => approveMut.mutate(lv.id)}
                            disabled={approveMut.isPending}
                            className="px-2.5 py-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectMut.mutate(lv.id)}
                            disabled={rejectMut.isPending}
                            className="px-2.5 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : lv.reviewed_by_name ? (
                        <span className="text-xs text-gray-400">by {lv.reviewed_by_name}</span>
                      ) : null}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── StaffPage ────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState('directory')

  const canEdit = user?.role === 'OWNER' || user?.role === 'HEADTEACHER'

  const { data: staffData } = useQuery({
    queryKey: ['staff'],
    queryFn: () => getStaff({}),
  })
  const allStaff = staffData?.results ?? []

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
        <p className="text-sm text-gray-500 mt-0.5">Staff profiles and leave requests</p>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-6">
          {[['directory', 'Staff Directory'], ['leave', 'Leave Requests']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-[#1B4F72] text-[#1B4F72]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'directory'
        ? <StaffDirectoryTab canEdit={canEdit} />
        : <LeaveTab canApprove={canEdit} allStaff={allStaff} />}
    </div>
  )
}
