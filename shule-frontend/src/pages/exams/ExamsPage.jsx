import { ClipboardList } from 'lucide-react'

export default function ExamsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <ClipboardList size={48} className="text-gray-200" />
      <h2 className="text-lg font-semibold text-gray-600">Exams</h2>
      <p className="text-sm text-gray-400">Exam schedule and results coming soon.</p>
    </div>
  )
}
