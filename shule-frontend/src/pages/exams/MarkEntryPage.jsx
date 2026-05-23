import { PenLine } from 'lucide-react'

export default function MarkEntryPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <PenLine size={48} className="text-gray-200" />
      <h2 className="text-lg font-semibold text-gray-600">Mark Entry</h2>
      <p className="text-sm text-gray-400">Enter student marks for this exam coming soon.</p>
    </div>
  )
}
