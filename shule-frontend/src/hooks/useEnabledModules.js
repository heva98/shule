import { useAuth } from '../context/AuthContext'

/**
 * Which optional modules this deployment has turned on. Rides along on the
 * /auth/login/ and /auth/me/ responses (see UserSerializer.enabled_modules)
 * instead of a separate /api/config/ fetch — that used to make every
 * module-gated dashboard query wait on an extra network round trip for data
 * that's static per deployment. `modulesLoading` mirrors auth's own loading
 * state, so callers can still hold off rendering module-gated nav/routes/UI
 * until the real list is known.
 */
export function useEnabledModules() {
  const { enabledModules, loading } = useAuth()

  return {
    enabledModules,
    modulesLoading: loading,
  }
}

// A module of `null`/`undefined` means "core" — always visible. An optional
// module is visible only once modules have loaded and it's in the list,
// so a disabled item never flashes on screen before being filtered out.
export function isModuleVisible(module, enabledModules, modulesLoading) {
  if (!module) return true
  if (modulesLoading) return false
  return enabledModules.includes(module)
}
