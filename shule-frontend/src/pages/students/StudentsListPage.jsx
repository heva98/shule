import { Users } from 'lucide-react'

export default function StudentsListPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <Users size={48} className="text-gray-200" />
      <h2 className="text-lg font-semibold text-gray-600">Students</h2>
      <p className="text-sm text-gray-400">Student list and search coming soon.</p>
    </div>
  )
}
