import api from '../lib/axios'

export const bulkMark = (data) =>
  api.post('/attendance/bulk/', data).then((r) => r.data)

export const getAttendance = (filters = {}) =>
  api.get('/attendance/', { params: filters }).then((r) => r.data)

export const getAttendanceSummary = (studentId, month, year) =>
  api
    .get('/attendance/summary/', { params: { student: studentId, month, year } })
    .then((r) => r.data)

export const getAbsentees = (date, level) =>
  api
    .get('/attendance/absentees/', { params: { date, level: level || undefined } })
    .then((r) => r.data)

export const getDailySummary = (params = {}) =>
  api.get('/attendance/daily-summary/', { params }).then((r) => r.data)

// Alias kept for StudentDetailPage compatibility
export const getAttendanceRecords = getAttendance
