// Helpers shared by the analytics page and the dashboard widgets that draw a
// saved visualization.
import { flattenTree, periodLabel } from './visualizationConfig'

// Query-key prefix for every saved-visualization list (the Open dialog and
// the dashboard's pinned widgets), so one invalidation refreshes both.
export const VISUALIZATIONS_KEY = ['analytics', 'visualizations']
export const PINNED_KEY = [...VISUALIZATIONS_KEY, 'pinned']

const MODULE_LABELS = {
  fees: 'Fees',
  exams: 'Exams',
  reports: 'Reports',
  sms: 'SMS',
  attendance: 'Attendance',
}

const moduleLabel = (key) => MODULE_LABELS[key] ?? key

function listJoin(words) {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

/**
 * One sentence on why a saved visualization can't be drawn, from the API's
 * `unavailable` list ([{ kind, id, label, reason, modules }]), or null when
 * everything it uses is available.
 */
export function unavailableMessage(unavailable) {
  if (!unavailable?.length) return null
  const byReason = (reason) => unavailable.filter((u) => u.reason === reason)

  const disabled = byReason('module_disabled')
  if (disabled.length) {
    const modules = [...new Set(disabled.flatMap((u) => u.modules))].map(moduleLabel)
    const plural = modules.length > 1
    return `It uses ${listJoin(disabled.map((u) => u.label))}, from the ${listJoin(modules)} module${plural ? 's' : ''}, `
      + `which ${plural ? 'are' : 'is'} switched off for this school.`
  }
  const denied = byReason('no_access')
  if (denied.length) {
    return `It uses ${listJoin(denied.map((u) => u.label))}, which your role cannot view.`
  }
  return `It uses data that is no longer available: ${listJoin(unavailable.map((u) => u.label))}.`
}

// Catalogue item labels per dimension, the fallback for an item a query
// response doesn't name.
export function catalogueItemLabels(dimensions) {
  const out = {}
  for (const d of dimensions ?? []) {
    const list = d.kind === 'org_unit' ? flattenTree(d.items) : d.items ?? []
    out[d.id] = Object.fromEntries(list.map((i) => [i.id, i.label]))
  }
  return out
}

// (dimId, itemId) => label, preferring the response's own names (ids repeat
// across dimensions: grade F, gender F).
export function makeLabelFor(itemLabels, response) {
  return (dimId, itemId) => {
    const name = response?.metaData?.items?.[dimId]?.items?.[itemId]?.name
    if (name) return name
    if (dimId === 'pe') return itemLabels.pe?.[itemId] ?? periodLabel(itemId)
    return itemLabels[dimId]?.[itemId] ?? (itemId || '(blank)')
  }
}

// A readable message from a failed save / rename / delete.
export function apiErrorMessage(err, fallback) {
  const data = err?.response?.data
  if (typeof data?.detail === 'string') return data.detail
  const field = data && ['name', 'config', 'description', 'shared_with_staff'].map((k) => data[k]).find(Boolean)
  if (field) return Array.isArray(field) ? field.join(' ') : String(field)
  return fallback
}
