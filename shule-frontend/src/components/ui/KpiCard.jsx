// Kaiadmin "gradient" widget: solid gradient card with decorative bubbles, a
// big value, an optional percentage on the right and a progress bar along the
// bottom. Used for the headline money / attendance figures.
//
// tone: primary | purple | success | warning | danger | info
const TONES = {
  primary: 'from-[#06418e] to-[#1572e8]',
  purple:  'from-[#2a20ac] to-[#6861ce]',
  success: 'from-[#179d08] to-[#31ce36]',
  warning: 'from-[#e1810b] to-[#ffad46]',
  danger:  'from-[#e80a15] to-[#f25961]',
  info:    'from-[#0a5a97] to-[#48abf7]',
}

export default function KpiCard({
  title,
  value,
  icon: Icon,
  tone = 'primary',
  percent = null,
  percentLabel,
  subtitle,
}) {
  const pct = percent === null || Number.isNaN(percent) ? null : Math.min(100, Math.max(0, percent))

  return (
    <div
      className={`kpi-bubbles rounded-xl shadow-card p-5 text-white bg-gradient-to-tl ${TONES[tone] ?? TONES.primary}`}
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1" style={{ containerType: 'inline-size' }}>
            <p className="text-sm text-white/80 flex items-center gap-2">
              {Icon && <Icon size={16} className="shrink-0" />}
              <span className="truncate">{title}</span>
            </p>
            <p
              className="mt-2 font-bold leading-tight whitespace-nowrap"
              style={{ fontSize: 'clamp(1.25rem, 11cqw, 2rem)' }}
              title={typeof value === 'string' ? value : undefined}
            >
              {value}
            </p>
          </div>
          {pct !== null && (
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold leading-tight">{pct.toFixed(1)}%</p>
              {percentLabel && <p className="text-xs text-white/70">{percentLabel}</p>}
            </div>
          )}
        </div>

        {pct !== null && (
          <div className="mt-4 h-1.5 rounded-full bg-white/25 overflow-hidden">
            <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
          </div>
        )}
        {subtitle && <p className="mt-2 text-xs text-white/75">{subtitle}</p>}
      </div>
    </div>
  )
}
