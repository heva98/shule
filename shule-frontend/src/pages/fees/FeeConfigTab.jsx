import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { getAcademicYears } from '../../api/fees'
import {
  createActivityPlan, createLunchConfig, createTuitionPlan, createUniformPlan,
  deleteActivityPlan, deleteLunchConfig, deleteTuitionPlan, deleteUniformPlan,
  getActivityPlans, getLunchConfigs, getTuitionPlans, getUniformPlans,
  updateActivityPlan, updateLunchConfig, updateTuitionPlan, updateUniformPlan,
} from '../../api/feeConfig'
import { LEVEL_LABEL } from '../../lib/constants'
import { formatTZS } from '../../lib/format'
import { ALL_LEVEL_GROUPS, useSchoolLevels } from '../../hooks/useSchoolLevels'

const selectCls = `border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`
const inputCls = `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

const TERM_OPTIONS = [
  { value: 'TERM1', label: 'Term 1' },
  { value: 'TERM2', label: 'Term 2' },
]
const QUARTER_MAP = {
  TERM1: [{ value: 'Q1', label: 'Quarter 1' }, { value: 'Q2', label: 'Quarter 2' }],
  TERM2: [{ value: 'Q3', label: 'Quarter 3' }, { value: 'Q4', label: 'Quarter 4' }],
}

const SUB_TABS = [
  { id: 'tuition', label: 'Tuition', hint: 'Annual · by level group or class' },
  { id: 'uniform', label: 'Uniform', hint: 'Annual · per class · opt-in' },
  { id: 'lunch', label: 'Lunch', hint: 'Quarterly · school-wide day / boarding rates' },
  { id: 'activity', label: 'Activity', hint: 'Quarterly · per class' },
]

function errMsg(err, fallback) {
  const d = err.response?.data
  if (d && typeof d === 'object') {
    const first = Object.values(d)[0]
    return Array.isArray(first) ? first[0] : String(first)
  }
  return d?.detail || fallback
}

// ── shared table chrome ───────────────────────────────────────────────────
function ConfigTable({ headers, isLoading, isError, isEmpty, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              {headers.map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={headers.length + 1} className="px-4 py-12 text-center text-sm text-gray-400">Loading…</td></tr>
            ) : isError ? (
              <tr><td colSpan={headers.length + 1} className="px-4 py-12 text-center text-sm text-danger">Failed to load.</td></tr>
            ) : (
              <>
                {children}
                {isEmpty && (
                  <tr><td colSpan={headers.length + 1} className="px-4 py-14 text-center text-sm text-gray-400">
                    Nothing configured yet.
                  </td></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RowActions({ row, onToggle, onDelete, busy }) {
  return (
    <td className="px-4 py-3">
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => onToggle(row)}
          disabled={busy}
          className={`px-2.5 py-1 text-xs rounded-lg border transition-colors disabled:opacity-50 ${
            row.is_active
              ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
              : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          {row.is_active ? 'Deactivate' : 'Activate'}
        </button>
        <button
          onClick={() => onDelete(row)}
          disabled={busy}
          className="p-1.5 rounded-md text-gray-400 hover:text-danger hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </td>
  )
}

function ActiveCell({ active }) {
  return active
    ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Active</span>
    : <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inactive</span>
}

function AddBar({ open, onToggle, label }) {
  return (
    <button
      onClick={onToggle}
      className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
    >
      <Plus size={15} /> {open ? 'Close' : label}
    </button>
  )
}

// ── generic mutation wiring ──────────────────────────────────────────────
function useConfigMutations(queryKey, { create, update, remove }) {
  const qc = useQueryClient()
  const opts = {
    onSuccess: () => qc.invalidateQueries({ queryKey: [queryKey] }),
  }
  return {
    create: useMutation({
      mutationFn: create,
      ...opts,
      onSuccess: () => { opts.onSuccess(); toast.success('Saved') },
      onError: (e) => toast.error(errMsg(e, 'Could not save')),
    }),
    toggle: useMutation({
      mutationFn: (row) => update(row.id, { is_active: !row.is_active }),
      ...opts,
      onError: (e) => toast.error(errMsg(e, 'Could not update')),
    }),
    remove: useMutation({
      mutationFn: (row) => remove(row.id),
      ...opts,
      onSuccess: () => { opts.onSuccess(); toast.success('Deleted') },
      onError: (e) => toast.error(errMsg(e, 'Could not delete (may be referenced by charges)')),
    }),
  }
}

function confirmDelete(row, mut) {
  if (window.confirm('Delete this configuration row? Existing charges already created from it are not affected.')) {
    mut.remove.mutate(row)
  }
}

// ── Tuition ──────────────────────────────────────────────────────────────
function TuitionSection({ yearId }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ scope: 'LEVEL_GROUP', level_group: 'PRIMARY', level: '', amount: '' })
  const { levelOptions } = useSchoolLevels()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cfg-tuition', yearId],
    queryFn: () => getTuitionPlans({ academic_year: yearId }),
    enabled: !!yearId,
  })
  const rows = data?.results ?? data ?? []
  const mut = useConfigMutations('cfg-tuition', {
    create: createTuitionPlan, update: updateTuitionPlan, remove: deleteTuitionPlan,
  })

  function submit(e) {
    e.preventDefault()
    const payload = {
      academic_year: yearId, scope: form.scope, amount: form.amount,
      level_group: form.scope === 'LEVEL_GROUP' ? form.level_group : '',
      level: form.scope === 'LEVEL' ? form.level : '',
    }
    mut.create.mutate(payload, { onSuccess: () => setOpen(false) })
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <p className="text-sm text-gray-500">Annual tuition. A single-class plan overrides the level-group plan for that class.</p>
        <AddBar open={open} onToggle={() => setOpen((o) => !o)} label="Add Tuition Plan" />
      </div>

      {open && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Applies to</label>
            <select className={selectCls} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              <option value="LEVEL_GROUP">Level group</option>
              <option value="LEVEL">Single class</option>
            </select>
          </div>
          {form.scope === 'LEVEL_GROUP' ? (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Level group</label>
              <select className={selectCls} value={form.level_group} onChange={(e) => setForm({ ...form, level_group: e.target.value })}>
                {ALL_LEVEL_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Class</label>
              <select className={selectCls} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} required>
                <option value="">Select class…</option>
                {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (TZS)</label>
            <input type="number" min="0" step="1" className={inputCls + ' w-40'} value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </div>
          <button type="submit" disabled={mut.create.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-secondary disabled:opacity-60">
            {mut.create.isPending && <Loader2 size={14} className="animate-spin" />} Save
          </button>
        </form>
      )}

      <ConfigTable headers={['Scope', 'Target', 'Amount', 'Status']}
        isLoading={isLoading} isError={isError} isEmpty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-gray-50/60">
            <td className="px-4 py-3 text-gray-500">{r.scope === 'LEVEL_GROUP' ? 'Level group' : 'Single class'}</td>
            <td className="px-4 py-3 font-medium text-gray-900">
              {r.scope === 'LEVEL_GROUP' ? (r.level_group_display || r.level_group) : (LEVEL_LABEL[r.level] || r.level)}
            </td>
            <td className="px-4 py-3">{formatTZS(r.amount)}</td>
            <td className="px-4 py-3"><ActiveCell active={r.is_active} /></td>
            <RowActions row={r} busy={mut.toggle.isPending || mut.remove.isPending}
              onToggle={(row) => mut.toggle.mutate(row)} onDelete={(row) => confirmDelete(row, mut)} />
          </tr>
        ))}
      </ConfigTable>
    </>
  )
}

// ── Uniform ──────────────────────────────────────────────────────────────
function UniformSection({ yearId }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ level: '', amount: '' })
  const { levelOptions } = useSchoolLevels()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cfg-uniform', yearId],
    queryFn: () => getUniformPlans({ academic_year: yearId }),
    enabled: !!yearId,
  })
  const rows = data?.results ?? data ?? []
  const mut = useConfigMutations('cfg-uniform', {
    create: createUniformPlan, update: updateUniformPlan, remove: deleteUniformPlan,
  })

  function submit(e) {
    e.preventDefault()
    mut.create.mutate({ academic_year: yearId, level: form.level, amount: form.amount },
      { onSuccess: () => setOpen(false) })
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <p className="text-sm text-gray-500">Standard annual uniform cost per class. Students are assigned uniform individually (Phase 3).</p>
        <AddBar open={open} onToggle={() => setOpen((o) => !o)} label="Add Uniform Plan" />
      </div>

      {open && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Class</label>
            <select className={selectCls} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} required>
              <option value="">Select class…</option>
              {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (TZS)</label>
            <input type="number" min="0" step="1" className={inputCls + ' w-40'} value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </div>
          <button type="submit" disabled={mut.create.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-secondary disabled:opacity-60">
            {mut.create.isPending && <Loader2 size={14} className="animate-spin" />} Save
          </button>
        </form>
      )}

      <ConfigTable headers={['Class', 'Amount', 'Status']}
        isLoading={isLoading} isError={isError} isEmpty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-gray-50/60">
            <td className="px-4 py-3 font-medium text-gray-900">{LEVEL_LABEL[r.level] || r.level}</td>
            <td className="px-4 py-3">{formatTZS(r.amount)}</td>
            <td className="px-4 py-3"><ActiveCell active={r.is_active} /></td>
            <RowActions row={r} busy={mut.toggle.isPending || mut.remove.isPending}
              onToggle={(row) => mut.toggle.mutate(row)} onDelete={(row) => confirmDelete(row, mut)} />
          </tr>
        ))}
      </ConfigTable>
    </>
  )
}

// ── Lunch ────────────────────────────────────────────────────────────────
function LunchSection({ yearId }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ term: 'TERM1', quarter: 'Q1', day_amount: '', boarding_amount: '' })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cfg-lunch', yearId],
    queryFn: () => getLunchConfigs({ academic_year: yearId }),
    enabled: !!yearId,
  })
  const rows = data?.results ?? data ?? []
  const mut = useConfigMutations('cfg-lunch', {
    create: createLunchConfig, update: updateLunchConfig, remove: deleteLunchConfig,
  })

  function submit(e) {
    e.preventDefault()
    mut.create.mutate({ academic_year: yearId, ...form }, { onSuccess: () => setOpen(false) })
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <p className="text-sm text-gray-500">School-wide lunch rates. When a quarter has a row here, lunch is charged to every student at the rate for their boarding/day status.</p>
        <AddBar open={open} onToggle={() => setOpen((o) => !o)} label="Add Lunch Rate" />
      </div>

      {open && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Term</label>
            <select className={selectCls} value={form.term}
              onChange={(e) => setForm({ ...form, term: e.target.value, quarter: QUARTER_MAP[e.target.value][0].value })}>
              {TERM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quarter</label>
            <select className={selectCls} value={form.quarter} onChange={(e) => setForm({ ...form, quarter: e.target.value })}>
              {QUARTER_MAP[form.term].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Day (TZS)</label>
            <input type="number" min="0" step="1" className={inputCls + ' w-36'} value={form.day_amount}
              onChange={(e) => setForm({ ...form, day_amount: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Boarding (TZS)</label>
            <input type="number" min="0" step="1" className={inputCls + ' w-36'} value={form.boarding_amount}
              onChange={(e) => setForm({ ...form, boarding_amount: e.target.value })} required />
          </div>
          <button type="submit" disabled={mut.create.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-secondary disabled:opacity-60">
            {mut.create.isPending && <Loader2 size={14} className="animate-spin" />} Save
          </button>
        </form>
      )}

      <ConfigTable headers={['Period', 'Day rate', 'Boarding rate', 'Status']}
        isLoading={isLoading} isError={isError} isEmpty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-gray-50/60">
            <td className="px-4 py-3 font-medium text-gray-900">{r.term?.replace('TERM', 'Term ')} · {r.quarter}</td>
            <td className="px-4 py-3">{formatTZS(r.day_amount)}</td>
            <td className="px-4 py-3">{formatTZS(r.boarding_amount)}</td>
            <td className="px-4 py-3"><ActiveCell active={r.is_active} /></td>
            <RowActions row={r} busy={mut.toggle.isPending || mut.remove.isPending}
              onToggle={(row) => mut.toggle.mutate(row)} onDelete={(row) => confirmDelete(row, mut)} />
          </tr>
        ))}
      </ConfigTable>
    </>
  )
}

// ── Activity ─────────────────────────────────────────────────────────────
function ActivitySection({ yearId }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ term: 'TERM1', quarter: 'Q1', level: '', amount: '' })
  const { levelOptions } = useSchoolLevels()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cfg-activity', yearId],
    queryFn: () => getActivityPlans({ academic_year: yearId }),
    enabled: !!yearId,
  })
  const rows = data?.results ?? data ?? []
  const mut = useConfigMutations('cfg-activity', {
    create: createActivityPlan, update: updateActivityPlan, remove: deleteActivityPlan,
  })

  function submit(e) {
    e.preventDefault()
    mut.create.mutate({ academic_year: yearId, ...form }, { onSuccess: () => setOpen(false) })
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <p className="text-sm text-gray-500">Per-class activity fee for a quarter. Applies to every student in the class.</p>
        <AddBar open={open} onToggle={() => setOpen((o) => !o)} label="Add Activity Plan" />
      </div>

      {open && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Term</label>
            <select className={selectCls} value={form.term}
              onChange={(e) => setForm({ ...form, term: e.target.value, quarter: QUARTER_MAP[e.target.value][0].value })}>
              {TERM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quarter</label>
            <select className={selectCls} value={form.quarter} onChange={(e) => setForm({ ...form, quarter: e.target.value })}>
              {QUARTER_MAP[form.term].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Class</label>
            <select className={selectCls} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} required>
              <option value="">Select class…</option>
              {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (TZS)</label>
            <input type="number" min="0" step="1" className={inputCls + ' w-40'} value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </div>
          <button type="submit" disabled={mut.create.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-secondary disabled:opacity-60">
            {mut.create.isPending && <Loader2 size={14} className="animate-spin" />} Save
          </button>
        </form>
      )}

      <ConfigTable headers={['Period', 'Class', 'Amount', 'Status']}
        isLoading={isLoading} isError={isError} isEmpty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-gray-50/60">
            <td className="px-4 py-3 font-medium text-gray-900">{r.term?.replace('TERM', 'Term ')} · {r.quarter}</td>
            <td className="px-4 py-3">{LEVEL_LABEL[r.level] || r.level}</td>
            <td className="px-4 py-3">{formatTZS(r.amount)}</td>
            <td className="px-4 py-3"><ActiveCell active={r.is_active} /></td>
            <RowActions row={r} busy={mut.toggle.isPending || mut.remove.isPending}
              onToggle={(row) => mut.toggle.mutate(row)} onDelete={(row) => confirmDelete(row, mut)} />
          </tr>
        ))}
      </ConfigTable>
    </>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────
export default function FeeConfigTab() {
  const [sub, setSub] = useState('tuition')
  const [pickedYearId, setPickedYearId] = useState('')

  const { data: yearsData } = useQuery({ queryKey: ['academic-years'], queryFn: getAcademicYears })
  const years = (yearsData?.results ?? yearsData ?? []).slice().sort((a, b) => b.year - a.year)

  // Fall back to the current (or newest) year until the user picks one.
  const defaultYear = years.find((y) => y.is_current) || years[0]
  const yearId = pickedYearId || (defaultYear ? String(defaultYear.id) : '')

  const Section = { tuition: TuitionSection, uniform: UniformSection, lunch: LunchSection, activity: ActivitySection }[sub]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {SUB_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              title={t.hint}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                sub === t.id ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select className={selectCls + ' ml-auto'} value={yearId} onChange={(e) => setPickedYearId(e.target.value)}>
          <option value="">Select year…</option>
          {years.map((y) => <option key={y.id} value={y.id}>{y.year}{y.is_current ? ' (Current)' : ''}</option>)}
        </select>
      </div>

      <p className="text-xs text-gray-400">{SUB_TABS.find((t) => t.id === sub)?.hint}</p>

      {yearId ? <Section yearId={Number(yearId)} /> : (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-sm text-gray-400">
          Pick an academic year to configure its fees.
        </div>
      )}
    </div>
  )
}
