import { Inbox } from 'lucide-react'

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'No data',
  message,
  action,
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <Icon size={28} className="text-gray-300" />
      </div>
      <h3 className="text-sm font-semibold text-gray-600 mb-1">{title}</h3>
      {message && (
        <p className="text-xs text-gray-400 max-w-xs">{message}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-[#1B4F72] text-white text-sm rounded-lg hover:bg-[#154060] transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
