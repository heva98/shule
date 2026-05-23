import api from '../lib/axios'

export const getAnnouncements = (level) =>
  api.get('/communications/announcements/', { params: level ? { level } : {} }).then((r) => r.data)

export const broadcastMessage = (data) =>
  api.post('/communications/broadcast/', data).then((r) => r.data)

export const getMessageHistory = (params = {}) =>
  api.get('/communications/history/', { params }).then((r) => r.data)
