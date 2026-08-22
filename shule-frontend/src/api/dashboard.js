import api from '../lib/axios'

export const getDashboardSummary = () =>
  api.get('/dashboard/summary/').then((r) => r.data)
