import api from '../lib/axios'

export const broadcast = (data) =>
  api.post('/communications/broadcast/', data).then((r) => r.data)

export const getHistory = (params = {}) =>
  api.get('/communications/history/', { params }).then((r) => r.data)

export const sendAbsenceAlerts = () =>
  api.post('/communications/send-absence-alerts/').then((r) => r.data)

export const sendFeeReminder = (studentId) =>
  api.post('/communications/fee-reminders/', { student_id: studentId }).then((r) => r.data)

export const sendBulkFeeReminders = () =>
  api.post('/communications/bulk-fee-reminders/').then((r) => r.data)

export const getAnnouncements = (level) =>
  api.get('/communications/announcements/', { params: level ? { level } : {} }).then((r) => r.data)

export const submitDemoRequest = (data) =>
  api.post('/communications/demo-requests/', data).then((r) => r.data)

// Legacy aliases
export const broadcastMessage = broadcast
export const getMessageHistory = getHistory
