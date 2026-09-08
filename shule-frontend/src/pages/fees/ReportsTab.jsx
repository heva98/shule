import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getAcademicYears } from '../../api/fees'
import {
  getFeeCollections, getFeeOutstanding, getFeeOverview, getFeeUnpaidStudents,
} from '../../api/feeReports'
import { LEVEL_LABEL } from '../../lib/constants'
import { formatTZS } from '../../lib/format'
import { useSchoolLevels } from '../../hooks/useSchoolLevels'

const selectCls = `border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

const CATEGORIES = [
  { value: 'TUITION', label: 'Tuition' },
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'LUNCH', label: 'Lunch' },
  { value: 'UNIFORM', label: 'Uniform' },
  { value: 'ACTIVITY', label: 'Activity' },
]
const GROUP_BY = [
  { value: 'category', label: 'Category' },
  { value: 'class', label: 'Class' },
  { value: 'method', label: 'Method' },
  { value: 'month', label: 'Month' },
]

function Card({ label, value, tone }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-bold mt-1 ${tone || 'text-gray-900'}`}>{value}</div>
    </div>
  )
}

function SimpleTable({ head, rows, empty }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60 text-xs font-medium text-gray-500 uppercase tracking-wide">
              {head.map((h, i) => (
                <th key={h} className={`px-4 py-3 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 ? (
              <tr><td colSpan={head.length} className="px-4 py-10 text-center text-gray-400">{empty}</td></tr>
            ) : rows}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ReportsTab() {
  const [pickedYear, setPickedYear] = useState('')
  const [term, setTerm] = useState('')
  const [level, setLevel] = useState('')
  const [groupBy, setGroupBy] = useState('category')
  const [unpaidCat, setUnpaidCat] = useState('TUITION')

  const { levelOptions } = useSchoolLevels()
  const { data: yearsData } = useQuery({ queryKey: ['academic-years'], queryFn: getAcademicYears })
  const years = (yearsData?.results ?? yearsData ?? []).slice().sort((a, b) => b.year - a.year)
  const defaultYear = years.find((y) => y.is_current) || years[0]
  const yearId = pickedYear || (defaultYear ? String(defaultYear.id) : '')

  const filters = { academic_year: yearId || undefined, term: term || undefined, level: level || undefined }
  const enabled = !!yearId

  const { data: overview } = useQuery({
    queryKey: ['fee-overview', filters], queryFn: () => getFeeOverview(filters), enabled,
  })
  const { data: collections } = useQuery({
    queryKey: ['fee-collections', filters, groupBy],
    queryFn: () => getFeeCollections({ ...filters, group_by: groupBy }), enabled,
  })
  const { data: outstanding } = useQuery({
    queryKey: ['fee-outstanding', filters],
    queryFn: () => getFeeOutstanding({ ...filters, group_by: 'class' }), enabled,
  })
  const { data: unpaid } = useQuery({
    queryKey: ['fee-unpaid', filters, unpaidCat],
    queryFn: () => getFeeUnpaidStudents({ ...filters, category: unpaidCat }), enabled,
  })

  const t = overview?.totals

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select className={selectCls} value={yearId} onChange={(e) => setPickedYear(e.target.value)}>
          <option value="">Year…</option>
          {years.map((y) => <option key={y.id} value={y.id}>{y.year}{y.is_current ? ' (Current)' : ''}</option>)}
        </select>
        <select className={selectCls} value={term} onChange={(e) => setTerm(e.target.value)}>
          <option value="">All terms</option>
          <option value="TERM1">Term 1</option>
          <option value="TERM2">Term 2</option>
        </select>
        <select className={selectCls} value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">All classes</option>
          {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {term && <span className="text-xs text-gray-400">Annual tuition is excluded when a term is selected.</span>}
      </div>

      {!yearId ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">
          Pick an academic year.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Required" value={formatTZS(t?.required ?? 0)} />
            <Card label="Collected" value={formatTZS(t?.collected ?? 0)} tone="text-success" />
            <Card label="Outstanding" value={formatTZS(t?.outstanding ?? 0)} tone="text-danger" />
            <Card label="Collection rate" value={`${t?.collection_rate_percent ?? '0'}%`} />
          </div>
          {Number(t?.credit_applied ?? 0) > 0 && (
            <p className="text-xs text-gray-400 -mt-2">
              Plus {formatTZS(t.credit_applied)} applied from carried credit (not counted as cash).
            </p>
          )}

          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">By category</h3>
            <SimpleTable
              head={['Category', 'Required', 'Collected', 'Outstanding']}
              empty="No charges."
              rows={(overview?.by_category ?? []).map((c) => (
                <tr key={c.category} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.category_display}</td>
                  <td className="px-4 py-3 text-right">{formatTZS(c.required)}</td>
                  <td className="px-4 py-3 text-right text-success">{formatTZS(c.collected)}</td>
                  <td className="px-4 py-3 text-right text-danger">{formatTZS(c.outstanding)}</td>
                </tr>
              ))}
            />
          </section>

          <section>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Collections</h3>
              <select className={selectCls + ' ml-auto'} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                {GROUP_BY.map((g) => <option key={g.value} value={g.value}>By {g.label.toLowerCase()}</option>)}
              </select>
            </div>
            <SimpleTable
              head={[GROUP_BY.find((g) => g.value === groupBy)?.label ?? '', 'Collected']}
              empty="Nothing collected for this filter."
              rows={(collections?.rows ?? []).map((r) => (
                <tr key={r.key ?? r.label} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3">{r.label}</td>
                  <td className="px-4 py-3 text-right">{formatTZS(r.collected)}</td>
                </tr>
              ))}
            />
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Outstanding by class</h3>
            <SimpleTable
              head={['Class', 'Required', 'Paid', 'Outstanding']}
              empty="Nothing outstanding."
              rows={(outstanding?.rows ?? []).map((r) => (
                <tr key={r.key ?? r.label} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3">{r.label}</td>
                  <td className="px-4 py-3 text-right">{formatTZS(r.required)}</td>
                  <td className="px-4 py-3 text-right text-success">{formatTZS(r.paid)}</td>
                  <td className="px-4 py-3 text-right text-danger">{formatTZS(r.outstanding)}</td>
                </tr>
              ))}
            />
          </section>

          <section>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Students with unpaid</h3>
              <select className={selectCls + ' ml-auto'} value={unpaidCat} onChange={(e) => setUnpaidCat(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <SimpleTable
              head={['Student', 'Class', 'Required', 'Paid', 'Outstanding']}
              empty="No students owe this fee."
              rows={(unpaid?.students ?? []).map((s) => (
                <tr key={s.student} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{s.student_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{s.student_id}</div>
                  </td>
                  <td className="px-4 py-3 text-right">{LEVEL_LABEL[s.level] || s.level_label || s.level}</td>
                  <td className="px-4 py-3 text-right">{formatTZS(s.required)}</td>
                  <td className="px-4 py-3 text-right text-success">{formatTZS(s.paid)}</td>
                  <td className="px-4 py-3 text-right text-danger font-semibold">{formatTZS(s.outstanding)}</td>
                </tr>
              ))}
            />
          </section>
        </>
      )}
    </div>
  )
}
