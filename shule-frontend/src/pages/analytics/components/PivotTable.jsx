import { useMemo } from 'react'
import { formatValue, headerSpans } from '../pivot'

const TH = 'border border-gray-200 px-3 py-1.5 font-semibold text-gray-700 whitespace-nowrap'

export default function PivotTable({ pivot, options, dimensionLabel }) {
  const { colDims, rowDims, colCombos, rowCombos, cell, label, isPlaceholder } = pivot
  const showLabels = options.showDimensionLabels

  const rowSpanStarts = useMemo(
    () => rowDims.map((_, level) =>
      new Map(headerSpans(rowCombos, level).map((s) => [s.start, s.span]))),
    [rowDims, rowCombos],
  )

  return (
    <div className="overflow-auto max-h-[70vh] rounded-lg border border-gray-200">
      <table className="border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50">
          {colDims.map((dim, level) => (
            <tr key={dim}>
              <th colSpan={rowDims.length} className={`${TH} text-right text-xs font-medium text-gray-500 bg-gray-100`}>
                {showLabels && !isPlaceholder(dim) ? dimensionLabel(dim) : ''}
              </th>
              {headerSpans(colCombos, level).map((s) => (
                <th key={s.start} colSpan={s.span} className={`${TH} text-center bg-gray-50`}>
                  {label(dim, s.id)}
                </th>
              ))}
            </tr>
          ))}
          {showLabels && !rowDims.every(isPlaceholder) && (
            <tr>
              {rowDims.map((dim) => (
                <th key={dim} className={`${TH} text-left text-xs font-medium text-gray-500 bg-gray-100`}>
                  {isPlaceholder(dim) ? '' : dimensionLabel(dim)}
                </th>
              ))}
              <th colSpan={colCombos.length} className="border border-gray-200 bg-gray-100" />
            </tr>
          )}
        </thead>
        <tbody>
          {rowCombos.map((rowCombo, ri) => (
            <tr key={rowCombo.join('|')} className="hover:bg-blue-50/40">
              {rowDims.map((dim, level) => {
                const span = rowSpanStarts[level].get(ri)
                if (span === undefined) return null
                return (
                  <th key={dim} rowSpan={span} scope="row"
                    className={`${TH} text-left align-top bg-white font-medium`}>
                    {label(dim, rowCombo[level])}
                  </th>
                )
              })}
              {colCombos.map((colCombo) => {
                const c = cell(colCombo, rowCombo)
                return (
                  <td key={colCombo.join('|')}
                    className="border border-gray-200 px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-gray-800">
                    {c?.suppressed ? (
                      <span className="text-gray-400 cursor-help" title="Hidden: too few pupils in this cell">*</span>
                    ) : c ? formatValue(c.value, c.unit, options.decimals) : ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
