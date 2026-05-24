import api from '../lib/axios'

export const getStaff = (params = {}) =>
  api.get('/staff/', { params }).then(r => r.data)

export const createStaff = (data) =>
  api.post('/staff/', data).then(r => r.data)

export const updateStaff = (id, data) =>
  api.patch(`/staff/${id}/`, data).then(r => r.data)

export const deleteStaff = (id) =>
  api.delete(`/staff/${id}/`)

export const getLeaveRequests = (params = {}) =>
  api.get('/staff/leave/', { params }).then(r => r.data)

export const createLeaveRequest = (data) =>
  api.post('/staff/leave/', data).then(r => r.data)

export const approveLeave = (id) =>
  api.put(`/staff/leave/${id}/approve/`).then(r => r.data)

export const rejectLeave = (id) =>
  api.put(`/staff/leave/${id}/reject/`).then(r => r.data)
