import Card from './Card'

// Soft colored "halo" behind the icon bubble — Kaiadmin's bubble-shadow
// treatment. Keyed by the same bg-* tokens callers already pass; falls
// back to a neutral halo for anything outside the five brand colors.
const GLOW = {
  'bg-primary':   'shadow-[0_0_0_8px_rgba(27,79,114,0.08)]',
  'bg-secondary': 'shadow-[0_0_0_8px_rgba(46,134,193,0.10)]',
  'bg-accent':    'shadow-[0_0_0_8px_rgba(243,156,18,0.12)]',
  'bg-success':   'shadow-[0_0_0_8px_rgba(39,174,96,0.10)]',
  'bg-danger':    'shadow-[0_0_0_8px_rgba(231,76,60,0.10)]',
}
const DEFAULT_GLOW = 'shadow-[0_0_0_8px_rgba(107,114,128,0.08)]'

export default function StatCard({ title, value, icon: Icon, color, subtitle }) {
  return (
    <Card>
      <div className="flex items-center gap-4">
        {Icon && (
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${color} ${GLOW[color] ?? DEFAULT_GLOW}`}>
            <Icon size={20} className="text-white" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">
            {title}
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900 leading-none break-all">
            {value}
          </p>
          {subtitle && (
            <p className="mt-1.5 text-xs text-gray-400">{subtitle}</p>
          )}
        </div>
      </div>
    </Card>
  )
}
