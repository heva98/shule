import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useEnabledModules } from '../../hooks/useEnabledModules'

export default function ProtectedRoute({ allowedRoles, requiredModule, children }) {
  const { user, accessToken, loading } = useAuth()
  const { enabledModules, modulesLoading } = useEnabledModules()

  // `requiredModule` may be a single module name or a list — a list means
  // "any one of these" (the merged Communications page needs communications OR
  // sms turned on).
  const requiredModules = Array.isArray(requiredModule)
    ? requiredModule
    : requiredModule ? [requiredModule] : []

  // Only block on the modules list for routes that actually gate on it — the
  // outer shell wrapper (no requiredModule) shouldn't wait.
  if (loading || (requiredModules.length > 0 && modulesLoading)) {
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

  if (requiredModules.length > 0 && !requiredModules.some((m) => enabledModules.includes(m))) {
    return <Navigate to="/dashboard" replace />
  }

  return children ?? <Outlet />
}
