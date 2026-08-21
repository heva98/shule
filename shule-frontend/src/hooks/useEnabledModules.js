import { useQuery } from '@tanstack/react-query'
import { getModuleConfig } from '../api/config'

/**
 * Which optional modules this deployment has turned on, fetched once at
 * boot. `modulesLoading` stays true until the first fetch resolves, so
 * callers can hold off rendering module-gated nav/routes/UI instead of
 * flashing them before the real list is known.
 */
export function useEnabledModules() {
  const { data, isLoading } = useQuery({
    queryKey: ['module-config'],
    queryFn: getModuleConfig,
    staleTime: 5 * 60 * 1000,
  })

  return {
    enabledModules: data?.enabled_modules ?? [],
    modulesLoading: isLoading,
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
