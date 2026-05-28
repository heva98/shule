import { useFieldArray, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useRef, useState } from 'react'
import { Camera, ChevronLeft, Loader2, Plus, Star, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { addGuardian, createStudent } from '../../api/students'
import {
  GENDER_OPTIONS,
  RELATIONSHIP_OPTIONS,
  STATUS_OPTIONS,
} from '../../lib/constants'
import { useSchoolLevels } from '../../hooks/useSchoolLevels'

// ── Helpers ────────────────────────────────────────────────────────────────

function SectionHeading({ children }) {
  return (
    <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2 mb-4">
      {children}
    </h3>
  )
}

function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}

const inputCls = `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
  disabled:bg-gray-50 disabled:text-gray-400`

const selectCls = `${inputCls} bg-white`

// ── Main page ──────────────────────────────────────────────────────────────

export default function StudentFormPage() {
  const navigate = useNavigate()
  const { levelOptions } = useSchoolLevels()

  const [photoFile,    setPhotoFile]    = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const photoInputRef                   = useRef(null)

  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: {
      first_name:          '',
      last_name:           '',
      middle_name:         '',
      date_of_birth:       '',
      gender:              '',
      level:               '',
      stream:              '',
      admission_date:      new Date().toISOString().split('T')[0],
      status:              'ACTIVE',
      nemis_id:            '',
      has_special_needs:   false,
      special_needs_notes: '',
      guardians: [],
    },
  })

  const { fields: guardianFields, append, remove } = useFieldArray({
    control,
    name: 'guardians',
  })

  const hasSpecialNeeds = watch('has_special_needs')

  // ── Photo ──────────────────────────────────────────────────────────────

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setPhotoPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  function removePhoto() {
    setPhotoFile(null)
    setPhotoPreview(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  // ── Guardians ──────────────────────────────────────────────────────────

  function addGuardianRow() {
    if (guardianFields.length >= 3) return
    append({
      full_name:          '',
      relationship:       '',
      phone:              '',
      whatsapp_phone:     '',
      email:              '',
      is_primary_contact: guardianFields.length === 0,
    })
  }

  function handleSetPrimary(index) {
    guardianFields.forEach((_, i) => {
      setValue(`guardians.${i}.is_primary_contact`, i === index, { shouldDirty: true })
    })
  }

  // ── Submit ─────────────────────────────────────────────────────────────

  async function onSubmit(data) {
    setSubmitting(true)
    try {
      const fd = new FormData()

      const studentFields = [
        'first_name', 'last_name', 'middle_name', 'date_of_birth',
        'gender', 'level', 'stream', 'admission_date', 'status', 'nemis_id',
        'special_needs_notes',
      ]
      studentFields.forEach((key) => {
        if (data[key] !== '' && data[key] != null) fd.append(key, data[key])
      })
      // Booleans must be strings for multipart
      fd.append('has_special_needs', data.has_special_needs ? 'true' : 'false')

      if (photoFile) fd.append('photo', photoFile)

      const student = await createStudent(fd)

      // Sequential guardian POSTs
      for (const g of data.guardians) {
        if (!g.full_name.trim() || !g.phone.trim()) continue
        const payload = {
          full_name:          g.full_name.trim(),
          relationship:       g.relationship,
          phone:              g.phone.trim(),
          whatsapp_phone:     g.whatsapp_phone?.trim() || '',
          email:              g.email?.trim() || '',
          is_primary_contact: g.is_primary_contact,
        }
        try {
          await addGuardian(student.id, payload)
        } catch {
          // Guardian failures are non-fatal; student was already created
          toast.error(`Guardian "${g.full_name}" could not be saved.`)
        }
      }

      toast.success(`${student.full_name} enrolled successfully.`)
      navigate(`/students/${student.id}`)
    } catch (err) {
      const detail = err.response?.data
      if (detail && typeof detail === 'object') {
        const first = Object.values(detail)[0]
        toast.error(Array.isArray(first) ? first[0] : String(first))
      } else {
        toast.error('Enrolment failed. Please check the form and try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/students')}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Enrol New Student</h1>
          <p className="text-sm text-gray-500">Fill in all required fields marked with *</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* ── Personal Information ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <SectionHeading>Personal Information</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <Field label="First Name" required error={errors.first_name?.message}>
              <input
                {...register('first_name', { required: 'First name is required' })}
                className={inputCls}
                placeholder="e.g. Amina"
              />
            </Field>

            <Field label="Last Name" required error={errors.last_name?.message}>
              <input
                {...register('last_name', { required: 'Last name is required' })}
                className={inputCls}
                placeholder="e.g. Hassan"
              />
            </Field>

            <Field label="Middle Name" error={errors.middle_name?.message}>
              <input
                {...register('middle_name')}
                className={inputCls}
                placeholder="Optional"
              />
            </Field>

            <Field label="Date of Birth" required error={errors.date_of_birth?.message}>
              <input
                type="date"
                {...register('date_of_birth', { required: 'Date of birth is required' })}
                className={inputCls}
              />
            </Field>

            <Field label="Gender" required error={errors.gender?.message}>
              <select
                {...register('gender', { required: 'Gender is required' })}
                className={selectCls}
              >
                <option value="">Select gender…</option>
                {GENDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field label="NEMIS ID" error={errors.nemis_id?.message}>
              <input
                {...register('nemis_id')}
                className={inputCls}
                placeholder="National education ID (optional)"
              />
            </Field>
          </div>
        </div>

        {/* ── Academic Details ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <SectionHeading>Academic Details</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <Field label="Level / Class" required error={errors.level?.message}>
              <select
                {...register('level', { required: 'Level is required' })}
                className={selectCls}
              >
                <option value="">Select level…</option>
                {levelOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Stream" error={errors.stream?.message}>
              <input
                {...register('stream')}
                className={inputCls}
                placeholder="e.g. A, Blue (optional)"
              />
            </Field>

            <Field label="Admission Date" required error={errors.admission_date?.message}>
              <input
                type="date"
                {...register('admission_date', { required: 'Admission date is required' })}
                className={inputCls}
              />
            </Field>

            <Field label="Status" required error={errors.status?.message}>
              <select
                {...register('status', { required: true })}
                className={selectCls}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {/* ── Photo ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <SectionHeading>Student Photo</SectionHeading>
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-24 h-24 rounded-full object-cover border-2 border-gray-200"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                  <Camera size={28} className="text-primary/40" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700
                  hover:bg-gray-50 transition-colors"
              >
                {photoPreview ? 'Change photo' : 'Upload photo'}
              </button>
              {photoPreview && (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="px-4 py-2 text-sm text-danger hover:bg-red-50 rounded-lg transition-colors"
                >
                  Remove
                </button>
              )}
              <p className="text-xs text-gray-400">JPG or PNG, max 2 MB</p>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoChange}
              className="hidden"
            />
          </div>
        </div>

        {/* ── Special Needs ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <SectionHeading>Special Needs</SectionHeading>
          <label className="flex items-center gap-3 cursor-pointer mb-4">
            <input
              type="checkbox"
              {...register('has_special_needs')}
              className="w-4 h-4 rounded border-gray-300 text-primary accent-primary"
            />
            <span className="text-sm text-gray-700">This student has special educational needs</span>
          </label>
          {hasSpecialNeeds && (
            <Field label="Notes on special needs" error={errors.special_needs_notes?.message}>
              <textarea
                {...register('special_needs_notes')}
                rows={3}
                className={`${inputCls} resize-none`}
                placeholder="Describe the student's specific needs, accommodations required, etc."
              />
            </Field>
          )}
        </div>

        {/* ── Guardians ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Guardians / Parents
              <span className="ml-1.5 text-xs font-normal text-gray-400">(up to 3)</span>
            </h3>
            {guardianFields.length < 3 && (
              <button
                type="button"
                onClick={addGuardianRow}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-secondary
                  font-medium transition-colors"
              >
                <Plus size={14} />
                Add Guardian
              </button>
            )}
          </div>

          {guardianFields.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              No guardians added yet.{' '}
              <button
                type="button"
                onClick={addGuardianRow}
                className="text-primary underline"
              >
                Add one
              </button>
            </p>
          )}

          <div className="space-y-5">
            {guardianFields.map((field, index) => {
              const isPrimary = watch(`guardians.${index}.is_primary_contact`)
              return (
                <div
                  key={field.id}
                  className={`border rounded-lg p-4 space-y-3 transition-colors ${
                    isPrimary ? 'border-primary/40 bg-primary/5' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500">
                        Guardian {index + 1}
                      </span>
                      {isPrimary && (
                        <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                          <Star size={11} className="fill-current" />
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={() => handleSetPrimary(index)}
                          className="text-xs text-gray-500 hover:text-primary transition-colors"
                        >
                          Set as primary
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="text-gray-400 hover:text-danger transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field
                      label="Full Name"
                      required
                      error={errors.guardians?.[index]?.full_name?.message}
                    >
                      <input
                        {...register(`guardians.${index}.full_name`, {
                          required: 'Guardian name is required',
                        })}
                        className={inputCls}
                        placeholder="e.g. Hassan Mohamed"
                      />
                    </Field>

                    <Field
                      label="Relationship"
                      required
                      error={errors.guardians?.[index]?.relationship?.message}
                    >
                      <select
                        {...register(`guardians.${index}.relationship`, {
                          required: 'Relationship is required',
                        })}
                        className={selectCls}
                      >
                        <option value="">Select…</option>
                        {RELATIONSHIP_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label="Phone Number"
                      required
                      error={errors.guardians?.[index]?.phone?.message}
                    >
                      <input
                        {...register(`guardians.${index}.phone`, {
                          required: 'Phone number is required',
                        })}
                        className={inputCls}
                        placeholder="+255 7xx xxx xxx"
                      />
                    </Field>

                    <Field
                      label="WhatsApp Number"
                      error={errors.guardians?.[index]?.whatsapp_phone?.message}
                    >
                      <input
                        {...register(`guardians.${index}.whatsapp_phone`)}
                        className={inputCls}
                        placeholder="If different from phone (optional)"
                      />
                    </Field>

                    <Field
                      label="Email"
                      error={errors.guardians?.[index]?.email?.message}
                      className="sm:col-span-2"
                    >
                      <input
                        type="email"
                        {...register(`guardians.${index}.email`)}
                        className={inputCls}
                        placeholder="Optional"
                      />
                    </Field>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <button
            type="button"
            onClick={() => navigate('/students')}
            disabled={submitting}
            className="px-5 py-2 border border-gray-300 rounded-lg text-sm text-gray-700
              hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg
              text-sm font-medium hover:bg-secondary disabled:opacity-60 transition-colors"
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            {submitting ? 'Enrolling…' : 'Enrol Student'}
          </button>
        </div>

      </form>
    </div>
  )
}
