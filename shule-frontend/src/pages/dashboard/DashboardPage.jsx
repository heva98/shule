import { BarChart3 } from 'lucide-react'

export default function DashboardPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <BarChart3 size={48} className="text-gray-200" />
      <h2 className="text-lg font-semibold text-gray-600">Dashboard</h2>
      <p className="text-sm text-gray-400">Analytics and summary cards coming soon.</p>
    </div>
  )
}
