import Card from './Card'

// Kaiadmin-style stat card: a solid rounded-square icon tile next to a
// light label and a bold value. `color` is a bg-* token (bg-primary,
// bg-secondary, bg-purple, bg-accent, bg-success, bg-danger).
export default function StatCard({ title, value, icon: Icon, color = 'bg-primary', subtitle }) {
  return (
    <Card padding="p-4">
      <div className="flex items-center gap-4">
        {Icon && (
          <div className={`w-16 h-16 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
            <Icon size={28} className="text-white" />
          </div>
        )}
        {/* inline-size container so the value can scale with the space the
            card actually has (cqw) and always stay on a single line. */}
        <div className="min-w-0 flex-1" style={{ containerType: 'inline-size' }}>
          <p className="text-sm text-gray-500 leading-tight">{title}</p>
          <p
            className="mt-1 font-bold text-ink leading-tight whitespace-nowrap"
            style={{ fontSize: 'clamp(1rem, 10cqw, 1.5rem)' }}
            title={typeof value === 'string' ? value : undefined}
          >
            {value}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-gray-400 leading-snug">{subtitle}</p>
          )}
        </div>
      </div>
    </Card>
  )
}
