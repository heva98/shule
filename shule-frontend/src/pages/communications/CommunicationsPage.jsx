import { MessageSquare } from 'lucide-react'

export default function CommunicationsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <MessageSquare size={48} className="text-gray-200" />
      <h2 className="text-lg font-semibold text-gray-600">Communications</h2>
      <p className="text-sm text-gray-400">Broadcast messages and parent notifications coming soon.</p>
    </div>
  )
}
