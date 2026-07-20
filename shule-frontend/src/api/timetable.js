import api from '../lib/axios'

export const getPeriods = () =>
  api.get('/timetable/periods/').then((r) => r.data)

export const createPeriod = (data) =>
  api.post('/timetable/periods/', data).then((r) => r.data)

export const updatePeriod = (id, data) =>
  api.patch(`/timetable/periods/${id}/`, data).then((r) => r.data)

export const deletePeriod = (id) =>
  api.delete(`/timetable/periods/${id}/`)

export const getTimetableEntries = (params = {}) =>
  api.get('/timetable/entries/', { params }).then((r) => r.data)

export const createTimetableEntry = (data) =>
  api.post('/timetable/entries/', data).then((r) => r.data)

export const updateTimetableEntry = (id, data) =>
  api.patch(`/timetable/entries/${id}/`, data).then((r) => r.data)

export const deleteTimetableEntry = (id) =>
  api.delete(`/timetable/entries/${id}/`)
