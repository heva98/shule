import { ShieldOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'

export default function UnauthorizedPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="text-center">
        <ShieldOff size={48} className="text-gray-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-800">Access Denied</h1>
        <p className="text-sm text-gray-500 mt-2 mb-6">
          You don&apos;t have permission to view this page.
        </p>
        <Button onClick={() => navigate(-1)}>
          Go back
        </Button>
      </div>
    </div>
  )
}
