import api from '../lib/axios'

export const getAttendanceRecords = (params = {}) =>
  api.get('/attendance/', { params }).then((r) => r.data)

export const getDailySummary = (params = {}) =>
  api.get('/attendance/daily-summary/', { params }).then((r) => r.data)

export const getAttendanceSummary = (params = {}) =>
  api.get('/attendance/summary/', { params }).then((r) => r.data)

export const getAbsentees = (params = {}) =>
  api.get('/attendance/absentees/', { params }).then((r) => r.data)

export const submitBulkAttendance = (data) =>
  api.post('/attendance/bulk/', data).then((r) => r.data)
