import { UserPlus } from 'lucide-react'

export default function StudentFormPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <UserPlus size={48} className="text-gray-200" />
      <h2 className="text-lg font-semibold text-gray-600">New Student</h2>
      <p className="text-sm text-gray-400">Enrolment form coming soon.</p>
    </div>
  )
}
