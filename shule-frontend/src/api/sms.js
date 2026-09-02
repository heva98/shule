import api from '../lib/axios'

// ── config & templates ─────────────────────────────────────────────────────
export const getSmsConfig = () =>
  api.get('/communications/sms/config/').then((r) => r.data)

export const updateSmsConfig = (data) =>
  api.patch('/communications/sms/config/', data).then((r) => r.data)

export const getSmsTemplates = (language) =>
  api.get('/communications/sms/templates/', { params: language ? { language } : {} })
    .then((r) => r.data)

export const updateSmsTemplate = (id, body) =>
  api.patch(`/communications/sms/templates/${id}/`, { body }).then((r) => r.data)

// ── composer ───────────────────────────────────────────────────────────────
export const getSendableExams = () =>
  api.get('/communications/sms/exams/').then((r) => r.data)

export const previewSms = (payload) =>
  api.post('/communications/sms/preview/', payload).then((r) => r.data)

export const sendSms = (payload) =>
  api.post('/communications/sms/send/', payload).then((r) => r.data)

// ── delivery log ───────────────────────────────────────────────────────────
export const getSmsBatches = (params = {}) =>
  api.get('/communications/sms/batches/', { params }).then((r) => r.data)

export const getSmsBatch = (id) =>
  api.get(`/communications/sms/batches/${id}/`).then((r) => r.data)

export const resendFailed = (id) =>
  api.post(`/communications/sms/batches/${id}/resend-failed/`).then((r) => r.data)
