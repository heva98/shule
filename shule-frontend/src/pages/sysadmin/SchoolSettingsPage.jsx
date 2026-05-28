import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, CheckCircle, Mail, MessageSquare, Save, Smartphone, Upload, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { getSettings, updateSettings } from '../../api/sysadmin'

const TANZANIA_REGIONS = [
  'Arusha', 'Dar es Salaam', 'Dodoma', 'Geita', 'Iringa', 'Kagera', 'Katavi', 'Kigoma',
  'Kilimanjaro', 'Lindi', 'Manyara', 'Mara', 'Mbeya', 'Mjini Magharibi', 'Morogoro',
  'Mtwara', 'Mwanza', 'Njombe', 'Pemba Kaskazini', 'Pemba Kusini', 'Pwani', 'Rukwa',
  'Ruvuma', 'Shinyanga', 'Simiyu', 'Singida', 'Songwe', 'Tabora', 'Tanga',
  'Unguja Kaskazini', 'Unguja Kusini',
]

const SCHOOL_TYPES = [
  { value: 'PRIMARY',   label: 'Primary School' },
  { value: 'SECONDARY', label: 'Secondary School' },
  { value: 'COMBINED',  label: 'Combined (Primary + Secondary)' },
]

const LEVEL_GROUPS = [
  { value: 'PRIMARY', label: 'Standard 1 – 7', desc: 'Primary school levels' },
  { value: 'OLEVEL',  label: 'O-Level (Form 1 – 4)', desc: 'Ordinary level secondary' },
  { value: 'ALEVEL',  label: 'A-Level (Form 5 – 6)', desc: 'Advanced level secondary' },
]

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
        <Icon size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  )
}

function Input({ className = '', ...props }) {
  return (
    <input
      {...props}
      className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${className}`}
    />
  )
}

export default function SchoolSettingsPage() {
  const qc = useQueryClient()
  const fileRef = useRef()
  const [logoPreview, setLogoPreview] = useState(null)
  const [logoFile, setLogoFile] = useState(null)
  const [activeLevels, setActiveLevels] = useState([])

  const q = useQuery({ queryKey: ['admin-settings'], queryFn: getSettings })
  const settings = q.data

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm()

  useEffect(() => {
    if (settings) {
      reset({
        school_name: settings.school_name ?? '',
        school_motto: settings.school_motto ?? '',
        established_year: settings.established_year ?? '',
        registration_number: settings.registration_number ?? '',
        school_type: settings.school_type ?? 'COMBINED',
        school_phone: settings.school_phone ?? '',
        school_email: settings.school_email ?? '',
        school_website: settings.school_website ?? '',
        school_address: settings.school_address ?? '',
        region: settings.region ?? '',
        district: settings.district ?? '',
      })
      setActiveLevels(Array.isArray(settings.active_levels) ? settings.active_levels : [])
    }
  }, [settings, reset])

  function toggleLevel(val) {
    setActiveLevels(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    )
  }

  const mut = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, active_levels: activeLevels }
      if (logoFile) payload.school_logo = logoFile
      return updateSettings(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      toast.success('Settings saved.')
      setLogoFile(null)
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save settings.'),
  })

  function handleLogoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  if (q.isLoading) {
    return (
      <div className="space-y-5">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse space-y-4">
            <div className="h-4 bg-gray-100 rounded w-1/4" />
            <div className="h-8 bg-gray-100 rounded" />
            <div className="h-8 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(d => mut.mutate(d))} className="space-y-5 pb-24">
      {/* School Identity */}
      <Section title="School Identity" icon={Building2}>
        {/* Logo */}
        <div className="flex items-start gap-5">
          <div
            onClick={() => fileRef.current.click()}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-primary/40 transition-colors overflow-hidden shrink-0"
          >
            {logoPreview || settings?.school_logo ? (
              <img
                src={logoPreview || settings.school_logo}
                alt="Logo"
                className="w-full h-full object-cover"
              />
            ) : (
              <Upload size={20} className="text-gray-300" />
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-gray-700">School Logo</p>
            <p className="text-xs text-gray-400">Click the box to upload. Recommended: square image, 256×256px or larger.</p>
            {logoFile && (
              <button type="button" onClick={() => { setLogoFile(null); setLogoPreview(null) }}
                className="text-xs text-danger hover:underline">Remove new logo</button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="School Name" error={errors.school_name?.message}>
            <Input {...register('school_name', { required: 'Required' })} placeholder="e.g. Kilimanjaro Secondary School" />
          </Field>
          <Field label="School Motto">
            <Input {...register('school_motto')} placeholder="e.g. Excellence Through Discipline" />
          </Field>
          <Field label="School Type">
            <select {...register('school_type')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
              {SCHOOL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Established Year">
            <Input type="number" {...register('established_year')} placeholder="e.g. 1985" min={1900} max={new Date().getFullYear()} />
          </Field>
          <Field label="Registration Number">
            <Input {...register('registration_number')} placeholder="Government registration no." />
          </Field>
        </div>

        {/* Active Level Groups */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            School Level Groups <span className="font-normal text-gray-400">(select all that apply)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {LEVEL_GROUPS.map(lg => {
              const checked = activeLevels.includes(lg.value)
              return (
                <button
                  key={lg.value}
                  type="button"
                  onClick={() => toggleLevel(lg.value)}
                  className={`text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                    checked
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                      checked ? 'border-primary bg-primary' : 'border-gray-300'
                    }`}>
                      {checked && <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-white"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{lg.label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{lg.desc}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          {activeLevels.length === 0 && (
            <p className="text-xs text-amber-600 mt-2">Select at least one level group.</p>
          )}
        </div>
      </Section>

      {/* Contact & Location */}
      <Section title="Contact & Location" icon={Building2}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Phone">
            <Input {...register('school_phone')} placeholder="+255 XXX XXX XXX" />
          </Field>
          <Field label="Email">
            <Input type="email" {...register('school_email')} placeholder="school@domain.tz" />
          </Field>
          <Field label="Website">
            <Input {...register('school_website')} placeholder="https://school.tz" />
          </Field>
          <Field label="Region">
            <select {...register('region')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="">— Select region —</option>
              {TANZANIA_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="District">
            <Input {...register('district')} placeholder="e.g. Rombo" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Physical Address">
              <textarea {...register('school_address')} rows={2}
                placeholder="Street / area, P.O. Box…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            </Field>
          </div>
        </div>
      </Section>

      {/* Notifications Config */}
      <Section title="Notification Channels" icon={MessageSquare}>
        {/* Email */}
        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Email (SMTP)</span>
            </div>
            <div className="flex items-center gap-1.5">
              {settings?.email_configured
                ? <CheckCircle size={14} className="text-success" />
                : <XCircle size={14} className="text-gray-300" />}
              <span className={`text-xs ${settings?.email_configured ? 'text-success' : 'text-gray-400'}`}>
                {settings?.email_configured ? 'Configured' : 'Not configured'}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Configure EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER and EMAIL_HOST_PASSWORD in the server .env file.
          </p>
        </div>

        {/* WhatsApp */}
        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-green-600" />
              <span className="text-sm font-medium text-gray-700">WhatsApp</span>
            </div>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
          </div>
          <p className="text-xs text-gray-500">
            Active via <strong>wa.me deep-links</strong>. Clicking a WhatsApp action opens the app with a pre-filled message.
          </p>
          <p className="text-xs text-gray-400">Full WhatsApp Business Cloud API integration — coming soon.</p>
        </div>

        {/* SMS */}
        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone size={16} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-500">SMS</span>
            </div>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Not configured</span>
          </div>
          <p className="text-xs text-gray-400">Africa's Talking SMS integration — coming soon.</p>
        </div>
      </Section>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-end gap-3 z-30">
        <button
          type="button"
          onClick={() => { reset(); setLogoFile(null); setLogoPreview(null) }}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          Reset
        </button>
        <button
          type="submit"
          disabled={mut.isPending}
          className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          <Save size={14} />
          {mut.isPending ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </form>
  )
}
