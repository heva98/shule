import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

import { useEnabledModules } from '../../hooks/useEnabledModules'

export default function ProtectedRoute({ allowedRoles, requiredModule, children }) {
  const { user, accessToken, loading } = useAuth()
  const { enabledModules, modulesLoading } = useEnabledModules()

  // Only wait on the modules fetch for routes that actually need it — the
  // outer shell wrapper (no requiredModule) shouldn't block on it.
  if (loading || (requiredModule && modulesLoading)) {

import { useModules } from '../../hooks/useModules'

export default function ProtectedRoute({ allowedRoles, module, children }) {
  const { user, accessToken, loading } = useAuth()
  const { hasModule, isLoading: modulesLoading } = useModules()

  if (loading || (module && modulesLoading)) {

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

  if (module && !hasModule(module)) {
    return <Navigate to="/unauthorized" replace />

  }

  return children ?? <Outlet />
}
