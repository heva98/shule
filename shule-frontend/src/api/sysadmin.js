import api from '../lib/axios'

export const getUsers = (params = {}) =>
  api.get('/admin/users/', { params }).then(r => r.data)

export const createUser = (data) =>
  api.post('/admin/users/', data).then(r => r.data)

export const updateUser = (id, data) =>
  api.put(`/admin/users/${id}/`, data).then(r => r.data)

export const changeRole = (id, data) =>
  api.put(`/admin/users/${id}/role/`, data).then(r => r.data)

export const resetPassword = (id, data) =>
  api.put(`/admin/users/${id}/reset-password/`, data).then(r => r.data)

export const toggleActive = (id) =>
  api.put(`/admin/users/${id}/toggle-active/`).then(r => r.data)

export const bulkImport = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/admin/users/bulk-import/', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const getSettings = () =>
  api.get('/admin/settings/').then(r => r.data)

export const updateSettings = (data) => {
  const fd = new FormData()
  Object.entries(data).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') fd.append(k, v)
  })
  return api.put('/admin/settings/', fd).then(r => r.data)
}

export const getAdminSubjects = (params = {}) =>
  api.get('/admin/subjects/', { params }).then(r => r.data)

export const createAdminSubject = (data) =>
  api.post('/admin/subjects/', data).then(r => r.data)

export const updateAdminSubject = (id, data) =>
  api.put(`/admin/subjects/${id}/`, data).then(r => r.data)

export const deactivateSubject = (id) =>
  api.delete(`/admin/subjects/${id}/`).then(r => r.data)

export const getAcademicYears = () =>
  api.get('/admin/academic-years/').then(r => r.data)

export const createAcademicYear = (data) =>
  api.post('/admin/academic-years/', data).then(r => r.data)

export const updateAcademicYear = (id, data) =>
  api.put(`/admin/academic-years/${id}/`, data).then(r => r.data)

export const setCurrentYear = (id) =>
  api.put(`/admin/academic-years/${id}/set-current/`).then(r => r.data)

export const getAuditLogs = (params = {}) =>
  api.get('/admin/audit-logs/', { params }).then(r => r.data)

export const getSystemHealth = () =>
  api.get('/admin/system-health/').then(r => r.data)
