import { FileText } from 'lucide-react'

export default function InvoicesPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <FileText size={48} className="text-gray-200" />
      <h2 className="text-lg font-semibold text-gray-600">Invoices</h2>
      <p className="text-sm text-gray-400">Invoice list and status coming soon.</p>
    </div>
  )
}
