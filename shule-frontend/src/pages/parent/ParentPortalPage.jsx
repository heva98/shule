import { Heart } from 'lucide-react'

export default function ParentPortalPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <Heart size={48} className="text-gray-200" />
      <h2 className="text-lg font-semibold text-gray-600">Parent Portal</h2>
      <p className="text-sm text-gray-400">Your children&apos;s progress and fees coming soon.</p>
    </div>
  )
}
