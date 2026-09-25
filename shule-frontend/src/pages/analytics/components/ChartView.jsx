import { ArrowLeftRight } from 'lucide-react'
import { memo } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import Button from '../../../components/ui/Button'
import { MAX_SERIES, tickFormatter } from '../charts'
import { formatValue } from '../pivot'

const INK = '#374151' // text-gray-700
const MUTED = '#6b7280' // text-gray-500
const GRID = '#e5e7eb' // gray-200
const SURFACE = '#ffffff'
const TICK = { fill: MUTED, fontSize: 12 }

function Legend({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-gray-700">
      {items.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
          {s.name}
        </li>
      ))}
    </ul>
  )
}

function TooltipValue({ text }) {
  return text === '*'
    ? <span className="text-gray-400">hidden (too few pupils)</span>
    : <span className="font-semibold tabular-nums text-gray-900">{text || '–'}</span>
}

function ChartTooltip({ active, payload, model }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const box = 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 shadow-card'
  if (model.type === 'PIE') {
    return (
      <div className={box}>
        <span className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ background: row.color }} />
        {row.name}: <TooltipValue text={row.label} />
      </div>
    )
  }
  return (
    <div className={box}>
      <p className="font-semibold text-gray-900 mb-1">{row.category}</p>
      <ul className="space-y-0.5">
        {model.series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            {s.name && <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.color }} />}
            {s.name && <span>{s.name}:</span>}
            <TooltipValue text={row[`${s.key}__label`]} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function targetLine(options, unit, horizontal) {
  if (options.targetValue === null || options.targetValue === undefined) return null
  const text = `${options.targetLabel || 'Target'} ${formatValue(options.targetValue, unit ?? 'count', options.decimals)}`
  return (
    <ReferenceLine
      {...(horizontal ? { x: options.targetValue } : { y: options.targetValue })}
      stroke={INK} strokeDasharray="6 4" strokeWidth={1.5} ifOverflow="extendDomain"
      label={{ value: text, position: 'insideTopRight', fill: INK, fontSize: 12 }}
    />
  )
}

function CartesianChart({ model, options }) {
  const { type, series, data, unit } = model
  const horizontal = type === 'BAR'
  const stacked = type === 'STACKED_COLUMN'
  const ticks = tickFormatter(unit)
  const tooltip = <Tooltip content={<ChartTooltip model={model} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
  const grid = <CartesianGrid stroke={GRID} vertical={horizontal} horizontal={!horizontal} />
  const target = targetLine(options, unit, horizontal)
  const labels = (s, position, fill = INK) => options.showDataLabels && (
    <LabelList dataKey={`${s.key}__label`} position={position} fill={fill} fontSize={11} />
  )
  // Many categories on the x axis: tilt the labels so they don't collide.
  const tilt = !horizontal && data.length > 6
  const xAxis = (
    <XAxis dataKey="category" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} interval={0}
      padding={type === 'LINE' ? { left: 32, right: 32 } : undefined}
      angle={tilt ? -35 : 0} textAnchor={tilt ? 'end' : 'middle'} height={tilt ? 70 : 30} />
  )
  const yAxis = <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={ticks} width={56} />

  if (type === 'LINE') {
    return (
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ top: 20, right: 24, left: 0, bottom: 4 }}>
          {grid}{xAxis}{yAxis}
          <Tooltip content={<ChartTooltip model={model} />} cursor={{ stroke: GRID }} />
          {target}
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} name={s.name ?? ''} stroke={s.color} strokeWidth={2} type="linear"
              dot={{ r: 4, fill: s.color, stroke: SURFACE, strokeWidth: 2 }} activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }}>
              {labels(s, 'top')}
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  const height = horizontal ? Math.max(320, data.length * (series.length * 14 + 18) + 60) : 400
  const last = series.length - 1
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} barGap={2} barCategoryGap="20%"
        margin={{ top: 20, right: horizontal ? 48 : 24, left: 0, bottom: 4 }}>
        {grid}
        {horizontal ? (
          <>
            <XAxis type="number" tick={TICK} tickLine={false} axisLine={false} tickFormatter={ticks} />
            <YAxis type="category" dataKey="category" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }}
              width={140} interval={0} />
          </>
        ) : (
          <>{xAxis}{yAxis}</>
        )}
        {tooltip}
        {target}
        {series.map((s, i) => {
          // Only a bar's outer end is rounded; stacked segments meet flush,
          // separated by a surface-coloured gap.
          const round = !stacked || i === last
          return (
            <Bar key={s.key} dataKey={s.key} name={s.name ?? ''} fill={s.color} maxBarSize={48}
              stackId={stacked ? 'stack' : undefined}
              stroke={stacked ? SURFACE : undefined} strokeWidth={stacked ? 1 : 0}
              radius={round ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0}>
              {labels(s, stacked ? 'center' : horizontal ? 'right' : 'top', stacked ? SURFACE : INK)}
            </Bar>
          )
        })}
      </BarChart>
    </ResponsiveContainer>
  )
}

function PieView({ model, options }) {
  const labelByName = Object.fromEntries(model.data.map((s) => [s.name, s.label]))
  return (
    <ResponsiveContainer width="100%" height={400}>
      <PieChart margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
        <Tooltip content={<ChartTooltip model={model} />} />
        <Pie data={model.data} dataKey="value" nameKey="name" outerRadius="75%" stroke={SURFACE} strokeWidth={2}
          label={options.showDataLabels ? ({ name }) => `${name}: ${labelByName[name]}` : false}
          labelLine={options.showDataLabels} fontSize={12}>
          {model.data.map((s) => <Cell key={s.key} fill={s.color} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  )
}

// An SVG (not HTML) so the PNG download can draw it like any other chart.
function SingleValue({ model, options, subtitle }) {
  const { name, cell, text } = model.single
  const target = options.targetValue
  const value = cell && !cell.suppressed ? Number(cell.value) : null
  let status = null
  if (target !== null && target !== undefined && value !== null) {
    const diff = value - target
    // The gap between two percentages is in percentage points, not percent.
    const amount = cell.unit === 'percent'
      ? `${formatValue(Math.abs(diff), 'points', options.decimals)} points`
      : formatValue(Math.abs(diff), cell.unit, options.decimals)
    const what = options.targetLabel || 'target'
    status = diff >= 0
      ? { text: `▲ ${amount} above ${what}`, color: '#15803d' }
      : { text: `▼ ${amount} below ${what}`, color: '#b91c1c' }
  }
  return (
    <svg viewBox="0 0 600 260" role="img" aria-label={`${name}: ${text}`} className="w-full max-w-2xl mx-auto h-auto block">
      <rect width="600" height="260" fill={SURFACE} />
      <text x="300" y="56" textAnchor="middle" fontSize="18" fontWeight="600" fill={INK}>{name}</text>
      {subtitle && <text x="300" y="82" textAnchor="middle" fontSize="13" fill={MUTED}>{subtitle}</text>}
      <text x="300" y="170" textAnchor="middle" fontSize="72" fontWeight="700" fill="#111827"
        style={{ fontVariantNumeric: 'tabular-nums' }}>
        {text === '*' ? '*' : text || '–'}
      </text>
      {text === '*' && <text x="300" y="210" textAnchor="middle" fontSize="13" fill={MUTED}>Hidden: too few pupils</text>}
      {status && <text x="300" y="215" textAnchor="middle" fontSize="15" fontWeight="600" fill={status.color}>{status.text}</text>}
    </svg>
  )
}

/**
 * Draws a chart model (see charts.js). `ref` wraps the drawing, so the PNG
 * download can find its <svg>.
 *
 * Memoised: a re-render replays recharts' entry animation, which hides data
 * labels until it ends (and would drop them from a PNG taken meanwhile).
 */
export default memo(function ChartView({ ref, model, options, subtitle, onSwapAxes }) {
  if (model.tooMany) {
    const canSwap = model.type !== 'PIE' && model.data.length <= MAX_SERIES
    return (
      <div className="flex flex-col items-center py-12 px-4 text-center">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">
          Too many {model.type === 'PIE' ? 'slices' : 'series'} to tell apart
        </h3>
        <p className="text-sm text-gray-500 max-w-md">
          This chart would need {model.tooMany} colours; charts show at most {MAX_SERIES}. Choose fewer items
          {canSwap ? ', or swap Series and Category' : ''}, or view it as a pivot table.
        </p>
        {canSwap && (
          <Button variant="outline" size="sm" icon={ArrowLeftRight} className="mt-4" onClick={onSwapAxes}>
            Swap Series and Category
          </Button>
        )}
      </div>
    )
  }

  if (model.type === 'SINGLE_VALUE') {
    return <div ref={ref}><SingleValue model={model} options={options} subtitle={subtitle} /></div>
  }

  const legend = model.series.filter((s) => s.name)
  return (
    <div>
      {(legend.length >= 2 || model.type === 'PIE') && <Legend items={legend} />}
      <div ref={ref}>
        {model.type === 'PIE' ? <PieView model={model} options={options} /> : <CartesianChart model={model} options={options} />}
      </div>
    </div>
  )
})
