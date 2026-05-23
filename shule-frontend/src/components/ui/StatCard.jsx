export default function StatCard({ title, value, icon: Icon, color, subtitle }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">
            {title}
          </p>
          <p className="mt-1.5 text-2xl font-bold text-gray-900 leading-none break-all">
            {value}
          </p>
          {subtitle && (
            <p className="mt-1.5 text-xs text-gray-400">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
            <Icon size={20} className="text-white" />
          </div>
        )}
      </div>
    </div>
  )
}
