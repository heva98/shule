import { Briefcase } from 'lucide-react'

export default function StaffPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <Briefcase size={48} className="text-gray-200" />
      <h2 className="text-lg font-semibold text-gray-600">Staff</h2>
      <p className="text-sm text-gray-400">Staff profiles and leave requests coming soon.</p>
    </div>
  )
}
