import { Wallet } from 'lucide-react'

export default function RecordPaymentPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <Wallet size={48} className="text-gray-200" />
      <h2 className="text-lg font-semibold text-gray-600">Record Payment</h2>
      <p className="text-sm text-gray-400">Payment recording form coming soon.</p>
    </div>
  )
}
