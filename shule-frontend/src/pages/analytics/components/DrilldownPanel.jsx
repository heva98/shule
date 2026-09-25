import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, X } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getAnalyticsDrilldown } from '../../../api/analytics'
import { formatValue } from '../pivot'

function errorMessage(err) {
  const data = err?.response?.data
  if (data?.detail) return data.detail
  if (err?.response?.status === 403) return 'You do not have access to these pupils.'
  return 'The pupil list could not be loaded. Try again.'
}

/**
 * Side panel listing the pupils behind one pivot cell.
 *
 * @param params       drill-down URLSearchParams (see ../drilldown.js)
 * @param cellSummary  [{ label, value }] describing the cell, shown as its heading
 */
export default function DrilldownPanel({ params, cellSummary, decimals, onClose }) {
  const paramString = params.toString()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['analytics', 'drilldown', paramString],
    queryFn: () => getAnalyticsDrilldown(new URLSearchParams(paramString)),
    retry: false,
    staleTime: 60 * 1000,
  })

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const metric = data?.metric

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby="drilldown-title"
        className="absolute inset-y-0 right-0 flex flex-col w-full sm:w-[28rem] max-w-full bg-white shadow-xl">
        <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <h2 id="drilldown-title" className="text-sm font-semibold text-gray-800">Pupils in this cell</h2>
            <dl className="mt-1 text-xs text-gray-500 space-y-0.5">
              {cellSummary.map(({ label, value }) => (
                <div key={label} className="flex gap-1">
                  <dt className="shrink-0">{label}:</dt>
                  <dd className="text-gray-700 truncate">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
            </div>
          ) : isError ? (
            <div className="flex items-start gap-2 m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{errorMessage(error)}</span>
            </div>
          ) : data.pupils.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No pupils to list for this cell.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Pupil</th>
                  <th className="px-2 py-2 text-left font-medium">Current class</th>
                  <th className="px-4 py-2 text-right font-medium">{metric.name}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.pupils.map((p) => (
                  <tr key={p.public_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <Link to={`/students/${p.public_id}`} className="font-medium text-primary hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-xs text-gray-400">{p.admission_no}</div>
                    </td>
                    <td className="px-2 py-2 text-gray-600 whitespace-nowrap">
                      {[p.level, p.stream].filter(Boolean).join(' ')}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-800">
                      {p.value === null ? '—' : formatValue(p.value, metric.unit, decimals)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data && data.pupils.length > 0 && (
          <p className="px-4 py-2 border-t border-gray-100 text-xs text-gray-500">
            {data.truncated
              ? `Showing the first ${data.pupils.length.toLocaleString()} of ${data.total.toLocaleString()} pupils.`
              : `${data.total.toLocaleString()} ${data.total === 1 ? 'pupil' : 'pupils'}.`}
          </p>
        )}
      </aside>
    </div>
  )
}
