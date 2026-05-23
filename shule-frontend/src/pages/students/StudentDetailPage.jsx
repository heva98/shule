import { User } from 'lucide-react'

export default function StudentDetailPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <User size={48} className="text-gray-200" />
      <h2 className="text-lg font-semibold text-gray-600">Student Profile</h2>
      <p className="text-sm text-gray-400">Student details and report card coming soon.</p>
    </div>
  )
}
