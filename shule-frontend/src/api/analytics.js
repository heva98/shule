import api from '../lib/axios'

export const getAnalyticsDimensions = () =>
  api.get('/analytics/dimensions/').then((r) => r.data)

// `params` is a URLSearchParams: the query repeats `dimension` and `filter`,
// which axios would otherwise serialise as `dimension[]=…`.
export const runAnalyticsQuery = (params) =>
  api.get('/analytics/query/', { params }).then((r) => r.data)

// The `exam` dimension has no item list in the catalogue (there can be many
// exams), so its selector reads the exams endpoint, following pagination.
export async function getExamItems(maxPages = 10) {
  const items = []
  let page = 1
  while (page <= maxPages) {
    const data = await api.get('/exams/', { params: { page } }).then((r) => r.data)
    const exams = Array.isArray(data) ? data : data.results ?? []
    for (const e of exams) {
      const where = [e.level, e.stream].filter(Boolean).join(' ')
      items.push({ id: String(e.id), label: where ? `${e.name} (${where})` : e.name })
    }
    if (Array.isArray(data) || !data.next) break
    page += 1
  }
  return items
}

// ── saved visualizations ─────────────────────────────────────────────────────

const VIZ = '/analytics/visualizations/'

// params: { search, pinned: 'true' }
export const listVisualizations = (params) =>
  api.get(VIZ, { params }).then((r) => r.data)

export const getVisualization = (id) =>
  api.get(`${VIZ}${id}/`).then((r) => r.data)

// data: { name, description, config, shared_with_staff }
export const createVisualization = (data) =>
  api.post(VIZ, data).then((r) => r.data)

export const updateVisualization = (id, data) =>
  api.patch(`${VIZ}${id}/`, data).then((r) => r.data)

export const deleteVisualization = (id) => api.delete(`${VIZ}${id}/`)

export const pinVisualization = (id) => api.post(`${VIZ}${id}/pin/`)

export const unpinVisualization = (id) => api.delete(`${VIZ}${id}/pin/`)
