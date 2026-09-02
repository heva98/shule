import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useEnabledModules } from '../../hooks/useEnabledModules'

export default function ProtectedRoute({ allowedRoles, requiredModule, children }) {
  const { user, accessToken, loading } = useAuth()
  const { enabledModules, modulesLoading } = useEnabledModules()

  // Only block on the modules list for routes that actually gate on it — the
  // outer shell wrapper (no requiredModule) shouldn't wait.
  if (loading || (requiredModule && modulesLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!accessToken) return <Navigate to="/login" replace />

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  if (requiredModule && !enabledModules.includes(requiredModule)) {
    return <Navigate to="/dashboard" replace />
  }

  return children ?? <Outlet />
}
