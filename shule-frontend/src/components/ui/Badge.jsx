export default function Badge({ label, colorClass }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass ?? 'bg-gray-100 text-gray-600'}`}
    >
      {label}
    </span>
  )
}
