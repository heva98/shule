import { CreditCard } from 'lucide-react'

export default function FeesPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <CreditCard size={48} className="text-gray-200" />
      <h2 className="text-lg font-semibold text-gray-600">Fees</h2>
      <p className="text-sm text-gray-400">Fee structures and overview coming soon.</p>
    </div>
  )
}
