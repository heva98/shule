import api from '../lib/axios'

export const getNotifications = (params = {}) =>
  api.get('/auth/notifications/', { params }).then(r => r.data)

export const markNotificationsRead = (ids) =>
  api.post('/auth/notifications/mark-read/', ids ? { ids } : {}).then(r => r.data)
