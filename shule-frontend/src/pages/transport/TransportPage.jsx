import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bus, Edit2, LogOut, MapPin, Plus, Settings, Trash2, User, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  createPickupPoint,
  createRoute,
  createRouteFee,
  createTransportAssignment,
  deletePickupPoint,
  deleteRoute,
  deleteRouteFee,
  deleteTransportAssignment,
  getPickupPoints,
  getRouteFees,
  getRoutes,
  getTransportAssignments,
  updatePickupPoint,
  updateRoute,
  updateRouteFee,
  vacateTransportAssignment,
} from '../../api/transport'
import { getAcademicYears } from '../../api/fees'
import { getStudents } from '../../api/students'
import { useAuth } from '../../context/AuthContext'
import { useSchoolLevels } from '../../hooks/useSchoolLevels'
import { FEATURE_ROLES } from '../../lib/constants'
import Modal from '../../components/ui/Modal'
import Tabs from '../../components/ui/Tabs'

const MANAGE_ROLES = FEATURE_ROLES.TRANSPORT

const QUARTER_OPTIONS = [
  { value: 'Q1', label: 'Quarter 1' },
  { value: 'Q2', label: 'Quarter 2' },
  { value: 'Q3', label: 'Quarter 3' },
  { value: 'Q4', label: 'Quarter 4' },
]

const selectCls = `border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-700
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtTime(t) {
  return t ? t.slice(0, 5) : '—'
}

function fmtTZS(n) {
  return `TZS ${Number(n ?? 0).toLocaleString('en-TZ')}`
}

// ── Student picker — searchable dropdown over an already class-scoped roster ───

function StudentPicker({ students, selected, onSelect, onClear, disabled, placeholder }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const filtered = query.trim().length > 0
    ? students.filter((s) => {
        const q = query.trim().toLowerCase()
        return s.full_name.toLowerCase().includes(q) || s.student_id.toLowerCase().includes(q)
      })
    : students

  useEffect(() => {
    function outside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  if (selected) {
    return (
      <div className="flex items-center gap-2 border-2 border-primary rounded-lg px-3 py-2 bg-primary/5">
        <User size={14} className="text-primary shrink-0" />
        <span className="text-sm flex-1 text-gray-800">
          {selected.full_name} <span className="text-xs text-gray-400 font-mono">{selected.student_id}</span>
        </span>
        <button type="button" onClick={onClear} className="p-0.5 text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:text-gray-400"
      />
      {open && !disabled && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">No matching students in this class.</p>
          ) : filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onSelect(s); setQuery(''); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm transition-colors flex items-center justify-between"
            >
              <span className="font-medium text-gray-900">{s.full_name}</span>
              <span className="text-xs text-gray-400 font-mono">{s.student_id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Route modal ──────────────────────────────────────────────────────────────────

function RouteModal({ route, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!route
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: route
      ? { name: route.name, vehicle_plate: route.vehicle_plate, driver_name: route.driver_name, driver_phone: route.driver_phone, capacity: route.capacity, is_active: route.is_active }
      : { capacity: 30, is_active: true },
  })

  const saveMut = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, capacity: Number(data.capacity) }
      return isEdit ? updateRoute(route.id, payload) : createRoute(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routes'] })
      toast.success(isEdit ? 'Route updated.' : 'Route added.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save.'),
  })

  return (
    <Modal isOpen title={isEdit ? 'Edit Route' : 'Add Route'} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit((d) => saveMut.mutate(d))} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Route Name *</label>
          <input {...register('name', { required: 'Required' })} placeholder="e.g. Mikocheni Route"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {errors.name && <p className="text-xs text-danger mt-1">{errors.name.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vehicle Plate</label>
            <input {...register('vehicle_plate')} placeholder="e.g. T123 ABC"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Capacity *</label>
            <input type="number" min="1" {...register('capacity', { required: true, min: 1 })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Driver Name</label>
            <input {...register('driver_name')} placeholder="Optional"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Driver Phone</label>
            <input
              {...register('driver_phone', {
                validate: (v) => {
                  if (!v) return true
                  const n = v.trim().replace(/[\s-]/g, '')
                  return /^\+255\d{9}$/.test(n) || 'Use +255 followed by 9 digits (e.g. +255712345678)'
                },
                setValueAs: (v) => {
                  if (!v) return ''
                  const n = v.trim().replace(/[\s-]/g, '')
                  return /^0\d{9}$/.test(n) ? '+255' + n.slice(1) : n
                },
              })}
              placeholder="Optional"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.driver_phone && <p className="text-xs text-danger mt-1">{errors.driver_phone.message}</p>}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" {...register('is_active')} className="rounded" />
          Active route
        </label>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saveMut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Route'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteRouteModal({ route, onClose }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => deleteRoute(route.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routes'] })
      toast.success('Route removed.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed — it may still have students assigned.'),
  })
  return (
    <Modal isOpen title="Remove Route" onClose={onClose} size="sm">
      <div className="p-6 space-y-4">
        <p className="text-sm text-gray-600">Remove <strong>{route.name}</strong>? This cannot be undone.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="flex-1 py-2.5 bg-danger text-white rounded-lg text-sm font-medium hover:bg-danger/90 disabled:opacity-50">
            {mut.isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Pickup point modal ───────────────────────────────────────────────────────────

function PickupPointModal({ route, point, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!point
  const { register, handleSubmit } = useForm({
    defaultValues: point
      ? { name: point.name, pickup_time: point.pickup_time?.slice(0, 5), dropoff_time: point.dropoff_time?.slice(0, 5), order: point.order }
      : { order: 1 },
  })
  const mut = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        order: Number(data.order),
        route: route.id,
        pickup_time: data.pickup_time || null,
        dropoff_time: data.dropoff_time || null,
      }
      return isEdit ? updatePickupPoint(point.id, payload) : createPickupPoint(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pickup-points', route.id] })
      toast.success(isEdit ? 'Pickup point updated.' : 'Pickup point added.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save.'),
  })
  return (
    <Modal isOpen title={isEdit ? 'Edit Pickup Point' : 'Add Pickup Point'} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
          <input {...register('name', { required: true })} placeholder="e.g. Mikocheni B Junction"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Pickup time</label>
            <input type="time" {...register('pickup_time')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Drop-off time</label>
            <input type="time" {...register('dropoff_time')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Stop order *</label>
          <input type="number" min="1" {...register('order', { required: true })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex gap-3 pt-2">
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

// ── Route fee modal ──────────────────────────────────────────────────────────────

function RouteFeeModal({ route, fee, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!fee
  const { data: yearsData } = useQuery({ queryKey: ['transport-academic-years'], queryFn: getAcademicYears })
  const years = yearsData?.results ?? yearsData ?? []

  const { register, handleSubmit } = useForm({
    defaultValues: fee
      ? { academic_year: fee.academic_year, quarter: fee.quarter, amount: fee.amount }
      : { academic_year: years.find((y) => y.is_current)?.id ?? '' },
  })

  const mut = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, amount: Number(data.amount), route: route.id }
      return isEdit ? updateRouteFee(fee.id, payload) : createRouteFee(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['route-fees', route.id] })
      toast.success(isEdit ? 'Fee updated.' : 'Fee added.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save.'),
  })

  return (
    <Modal isOpen title={isEdit ? 'Edit Transport Fee' : 'Add Transport Fee'} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Academic Year *</label>
          <select {...register('academic_year', { required: true })} className={selectCls + ' w-full'}>
            <option value="">Select…</option>
            {years.map((y) => <option key={y.id} value={y.id}>{y.year}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Quarter *</label>
          <select {...register('quarter', { required: true })} className={selectCls + ' w-full'}>
            <option value="">Select…</option>
            {QUARTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Amount (TZS) *</label>
          <input type="number" min="0" step="0.01" {...register('amount', { required: true, min: 0 })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex gap-3 pt-2">
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

// ── Route detail (pickup points + fees) ──────────────────────────────────────────

function RouteDetailModal({ route, canManage, onClose }) {
  const qc = useQueryClient()
  const [showAddPoint, setShowAddPoint] = useState(false)
  const [editPoint, setEditPoint] = useState(null)
  const [showAddFee, setShowAddFee] = useState(false)
  const [editFee, setEditFee] = useState(null)

  const { data: pointsData } = useQuery({
    queryKey: ['pickup-points', route.id],
    queryFn: () => getPickupPoints({ route: route.id }),
  })
  const points = pointsData?.results ?? pointsData ?? []

  const { data: feesData } = useQuery({
    queryKey: ['route-fees', route.id],
    queryFn: () => getRouteFees({ route: route.id }),
  })
  const fees = feesData?.results ?? feesData ?? []

  const deletePointMut = useMutation({
    mutationFn: (id) => deletePickupPoint(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pickup-points', route.id] })
      toast.success('Pickup point removed.')
    },
    onError: () => toast.error('Failed to remove.'),
  })

  const deleteFeeMut = useMutation({
    mutationFn: (id) => deleteRouteFee(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['route-fees', route.id] })
      toast.success('Fee removed.')
    },
    onError: () => toast.error('Failed to remove.'),
  })

  return (
    <Modal isOpen title={route.name} onClose={onClose} size="lg">
      <div className="p-6 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <MapPin size={14} /> Pickup Points
            </h3>
            {canManage && (
              <button onClick={() => setShowAddPoint(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90">
                <Plus size={12} /> Add
              </button>
            )}
          </div>
          {points.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No pickup points added yet.</p>
          ) : (
            <div className="space-y-2">
              {points.map((p) => (
                <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.order}. {p.name}</p>
                    <p className="text-xs text-gray-400">Pickup {fmtTime(p.pickup_time)} &middot; Drop-off {fmtTime(p.dropoff_time)}</p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditPoint(p)} className="p-1.5 rounded hover:bg-gray-200 text-gray-400"><Edit2 size={13} /></button>
                      <button onClick={() => deletePointMut.mutate(p.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-danger"><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Transport Fees</h3>
            {canManage && (
              <button onClick={() => setShowAddFee(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90">
                <Plus size={12} /> Add
              </button>
            )}
          </div>
          {fees.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No fees set up yet.</p>
          ) : (
            <div className="space-y-2">
              {fees.map((f) => (
                <div key={f.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-sm text-gray-800">
                    {f.academic_year_label ?? f.academic_year} &middot; {f.quarter} <span className="text-gray-400">({f.term?.replace('TERM', 'Term ')})</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{fmtTZS(f.amount)}</span>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditFee(f)} className="p-1.5 rounded hover:bg-gray-200 text-gray-400"><Edit2 size={13} /></button>
                        <button onClick={() => deleteFeeMut.mutate(f.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-danger"><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAddPoint && <PickupPointModal route={route} onClose={() => setShowAddPoint(false)} />}
      {editPoint && <PickupPointModal route={route} point={editPoint} onClose={() => setEditPoint(null)} />}
      {showAddFee && <RouteFeeModal route={route} onClose={() => setShowAddFee(false)} />}
      {editFee && <RouteFeeModal route={route} fee={editFee} onClose={() => setEditFee(null)} />}
    </Modal>
  )
}

// ── Routes tab ────────────────────────────────────────────────────────────────

function RoutesTab({ canManage }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editRoute, setEditRoute] = useState(null)
  const [deleteRouteObj, setDeleteRouteObj] = useState(null)
  const [detailRoute, setDetailRoute] = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['routes'], queryFn: () => getRoutes() })
  const routes = data?.results ?? data ?? []

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
            <Plus size={14} /> Add Route
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-36" />)}
        </div>
      ) : routes.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          <Bus size={28} className="mx-auto text-gray-200 mb-2" />
          No routes set up yet.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {routes.map((r) => {
            const pct = r.capacity > 0 ? Math.min(100, Math.round((r.occupied_count / r.capacity) * 100)) : 0
            const barColor = pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-accent' : 'bg-success'
            return (
              <div key={r.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                      <Bus size={14} className="text-primary" /> {r.name}
                    </p>
                    {r.vehicle_plate && <p className="text-xs text-gray-400 mt-0.5">{r.vehicle_plate}</p>}
                    {!r.is_active && <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditRoute(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><Edit2 size={13} /></button>
                      <button onClick={() => setDeleteRouteObj(r)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-danger"><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>

                {r.driver_name && <p className="text-xs text-gray-500 mt-2">Driver: {r.driver_name}{r.driver_phone ? ` · ${r.driver_phone}` : ''}</p>}
                <p className="text-xs text-gray-400 mt-0.5">{r.pickup_points?.length ?? 0} pickup point{r.pickup_points?.length === 1 ? '' : 's'}</p>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>{r.occupied_count} / {r.capacity} seats</span>
                    <span>{r.available_seats} free</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <button onClick={() => setDetailRoute(r)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50">
                  <Settings size={12} /> Manage stops & fees
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && <RouteModal onClose={() => setShowAdd(false)} />}
      {editRoute && <RouteModal route={editRoute} onClose={() => setEditRoute(null)} />}
      {deleteRouteObj && <DeleteRouteModal route={deleteRouteObj} onClose={() => setDeleteRouteObj(null)} />}
      {detailRoute && <RouteDetailModal route={detailRoute} canManage={canManage} onClose={() => setDetailRoute(null)} />}
    </div>
  )
}

// ── Assign student modal ─────────────────────────────────────────────────────────

function AssignModal({ onClose }) {
  const qc = useQueryClient()
  const { levelOptions } = useSchoolLevels()
  const [routeId, setRouteId] = useState('')
  const [level, setLevel] = useState('')
  const [stream, setStream] = useState('')
  const [student, setStudent] = useState(null)
  const [pickupPointId, setPickupPointId] = useState('')
  const [academicYear, setAcademicYear] = useState('')

  const { data: yearsData } = useQuery({ queryKey: ['transport-academic-years'], queryFn: getAcademicYears })
  const years = yearsData?.results ?? yearsData ?? []
  const effectiveYear = academicYear || years.find((y) => y.is_current)?.id || ''

  const { data: routeData } = useQuery({ queryKey: ['routes-all'], queryFn: () => getRoutes({ active: 'true' }) })
  const routes = routeData?.results ?? routeData ?? []
  const selectedRoute = routes.find((r) => String(r.id) === String(routeId))

  const studentsQ = useQuery({
    queryKey: ['transport-class-students', level, stream],
    queryFn: () => getStudents({ level, stream: stream || undefined, status: 'ACTIVE', all: 'true' }),
    enabled: !!level && !!routeId,
  })
  const classStudents = studentsQ.data?.results ?? studentsQ.data ?? []

  const saveMut = useMutation({
    mutationFn: () => createTransportAssignment({
      student: student.id, route: routeId, pickup_point: pickupPointId || null, academic_year: effectiveYear,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transport-assignments'] })
      qc.invalidateQueries({ queryKey: ['routes'] })
      toast.success('Student assigned.')
      onClose()
    },
    onError: (err) => {
      const data = err.response?.data
      toast.error(data?.route?.[0] ?? data?.pickup_point?.[0] ?? data?.detail ?? 'Failed to assign.')
    },
  })

  return (
    <Modal isOpen title="Assign Student to Route" onClose={onClose} size="sm">
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Route *</label>
          <select
            value={routeId}
            onChange={(e) => { setRouteId(e.target.value); setStudent(null); setPickupPointId('') }}
            className={selectCls + ' w-full'}
          >
            <option value="">Select…</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>{r.name} ({r.available_seats} free)</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Class *</label>
            <select
              value={level}
              onChange={(e) => { setLevel(e.target.value); setStudent(null) }}
              disabled={!routeId}
              className={selectCls + ' w-full'}
            >
              <option value="">{routeId ? 'Select…' : 'Pick a route first'}</option>
              {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Stream</label>
            <input
              value={stream}
              onChange={(e) => { setStream(e.target.value); setStudent(null) }}
              disabled={!routeId}
              placeholder="Optional"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Student *</label>
          <StudentPicker
            students={classStudents}
            selected={student}
            onSelect={setStudent}
            onClear={() => setStudent(null)}
            disabled={!level || !routeId}
            placeholder={!routeId ? 'Pick a route first' : !level ? 'Pick a class first' : 'Search this class…'}
          />
        </div>

        {selectedRoute && selectedRoute.pickup_points?.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Pickup point</label>
            <select value={pickupPointId} onChange={(e) => setPickupPointId(e.target.value)} className={selectCls + ' w-full'}>
              <option value="">— None —</option>
              {selectedRoute.pickup_points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Academic Year</label>
          <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className={selectCls + ' w-full'}>
            <option value="">Current year</option>
            {years.map((y) => <option key={y.id} value={y.id}>{y.year}</option>)}
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={!student || !routeId || !effectiveYear || saveMut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saveMut.isPending ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Assignments tab ──────────────────────────────────────────────────────────────

function AssignmentsTab({ canManage }) {
  const qc = useQueryClient()
  const [showAssign, setShowAssign] = useState(false)
  const [showVacated, setShowVacated] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['transport-assignments', showVacated],
    queryFn: () => getTransportAssignments({ active: showVacated ? undefined : 'true' }),
  })
  const assignments = data?.results ?? data ?? []

  const vacateMut = useMutation({
    mutationFn: (id) => vacateTransportAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transport-assignments'] })
      qc.invalidateQueries({ queryKey: ['routes'] })
      toast.success('Student vacated from route.')
    },
    onError: () => toast.error('Failed to vacate.'),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => deleteTransportAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transport-assignments'] })
      qc.invalidateQueries({ queryKey: ['routes'] })
      toast.success('Assignment removed.')
    },
    onError: () => toast.error('Failed to remove.'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600 select-none">
          <input type="checkbox" checked={showVacated} onChange={(e) => setShowVacated(e.target.checked)} className="rounded" />
          Show vacated
        </label>
        {canManage && (
          <button onClick={() => setShowAssign(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
            <Plus size={14} /> Assign Student
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Student</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Route</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Pickup Point</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Assigned</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded" /></td></tr>
              ))
            ) : assignments.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">
                <Bus size={28} className="mx-auto text-gray-200 mb-2" />
                No transport assignments found.
              </td></tr>
            ) : assignments.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">{a.student_name}</td>
                <td className="px-4 py-3 text-gray-600">{a.route_name}</td>
                <td className="px-4 py-3 text-gray-500">{a.pickup_point_name || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{fmtDate(a.assigned_at)}</td>
                <td className="px-4 py-3">
                  {a.is_active
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Vacated</span>}
                </td>
                {canManage && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {a.is_active && (
                        <button onClick={() => vacateMut.mutate(a.id)} title="Vacate"
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                          <LogOut size={13} />
                        </button>
                      )}
                      <button onClick={() => deleteMut.mutate(a.id)} title="Delete"
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-danger">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAssign && <AssignModal onClose={() => setShowAssign(false)} />}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TransportPage() {
  const { user } = useAuth()
  const canManage = MANAGE_ROLES.includes(user?.role)
  const [tab, setTab] = useState('routes')

  const tabs = [
    { id: 'routes', label: 'Routes' },
    { id: 'assignments', label: 'Assignments' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Transport</h1>
        <p className="text-sm text-gray-500 mt-0.5">Bus routes, pickup points, and transport fees.</p>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'routes' && <RoutesTab canManage={canManage} />}
      {tab === 'assignments' && <AssignmentsTab canManage={canManage} />}
    </div>
  )
}
