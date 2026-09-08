import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { getAcademicYears } from '../../api/fees'
import { generateCharges } from '../../api/feeCharges'
import { useSchoolLevels } from '../../hooks/useSchoolLevels'

const selectCls = `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`
const inputCls = `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

const QUARTER_MAP = {
  TERM1: [{ value: 'Q1', label: 'Quarter 1' }, { value: 'Q2', label: 'Quarter 2' }],
  TERM2: [{ value: 'Q3', label: 'Quarter 3' }, { value: 'Q4', label: 'Quarter 4' }],
}

export default function GenerateChargesModal({ onClose }) {
  const qc = useQueryClient()
  const { levelOptions } = useSchoolLevels()
  const { data: yearsData } = useQuery({ queryKey: ['academic-years'], queryFn: getAcademicYears })
  const years = (yearsData?.results ?? yearsData ?? []).slice().sort((a, b) => b.year - a.year)

  const [form, setForm] = useState({
    academic_year: '', scope: 'ANNUAL', term: 'TERM1', quarter: 'Q1',
    level: '', due_date: '',
  })
  const [result, setResult] = useState(null)

  const mut = useMutation({
    mutationFn: generateCharges,
    onSuccess: (data) => {
      setResult(data)
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['student-fee-summary'] })
    },
    onError: (err) => {
      const d = err.response?.data
      toast.error(d?.detail || Object.values(d ?? {}).flat()[0] || 'Generation failed.')
    },
  })

  function submit(e) {
    e.preventDefault()
    const payload = {
      academic_year: Number(form.academic_year),
      scope: form.scope,
      due_date: form.due_date || null,
      levels: form.level ? [form.level] : undefined,
    }
    if (form.scope === 'QUARTERLY') {
      payload.term = form.term
      payload.quarter = form.quarter
    }
    mut.mutate(payload)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Generate Charges</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="px-6 py-8 text-center">
            <CheckCircle size={40} className="mx-auto text-success mb-3" />
            <p className="font-semibold text-gray-900">Done</p>
            <p className="text-sm text-gray-500 mt-2">
              {result.created} created · {result.updated} updated · {result.voided} voided<br />
              {result.skipped_paid} left (already paid) · {result.students} students touched
            </p>
            <button onClick={onClose}
              className="mt-6 px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-secondary">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Academic Year *</label>
              <select className={selectCls} value={form.academic_year} required
                onChange={(e) => setForm({ ...form, academic_year: e.target.value })}>
                <option value="">Select year…</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>{y.year}{y.is_current ? ' (Current)' : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Scope *</label>
              <select className={selectCls} value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                <option value="ANNUAL">Annual — tuition</option>
                <option value="QUARTERLY">Quarterly — lunch / transport / activity</option>
              </select>
            </div>

            {form.scope === 'QUARTERLY' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Term</label>
                  <select className={selectCls} value={form.term}
                    onChange={(e) => setForm({ ...form, term: e.target.value, quarter: QUARTER_MAP[e.target.value][0].value })}>
                    <option value="TERM1">Term 1</option>
                    <option value="TERM2">Term 2</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quarter</label>
                  <select className={selectCls} value={form.quarter}
                    onChange={(e) => setForm({ ...form, quarter: e.target.value })}>
                    {QUARTER_MAP[form.term].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Class (optional)</label>
              <select className={selectCls} value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}>
                <option value="">All active students</option>
                {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due date (optional)</label>
              <input type="date" className={inputCls} value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>

            <p className="text-xs text-gray-400">
              Idempotent — re-run any time. Unpaid charges are refreshed to the current
              configured amount; paid charges are left untouched.
            </p>

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={mut.isPending || !form.academic_year}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-secondary disabled:opacity-60">
                {mut.isPending && <Loader2 size={14} className="animate-spin" />}
                {mut.isPending ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
