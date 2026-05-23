import { CalendarCheck } from 'lucide-react'

export default function AttendancePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <CalendarCheck size={48} className="text-gray-200" />
      <h2 className="text-lg font-semibold text-gray-600">Attendance</h2>
      <p className="text-sm text-gray-400">Daily register and absence tracking coming soon.</p>
    </div>
  )
}
