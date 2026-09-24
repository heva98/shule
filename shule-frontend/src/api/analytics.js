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
