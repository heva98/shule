import api from '../lib/axios'

export const getStudents = (params = {}) =>
  api.get('/students/', { params }).then((r) => r.data)

export const getStudent = (id) =>
  api.get(`/students/${id}/`).then((r) => r.data)

export const createStudent = (formData) =>
  api
    .post('/students/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)

export const updateStudent = (id, formData) =>
  api
    .patch(`/students/${id}/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)

export const getStudentGuardians = (id) =>
  api.get(`/students/${id}/guardians/`).then((r) => r.data)

export const addGuardian = (studentId, data) =>
  api.post(`/students/${studentId}/guardians/`, data).then((r) => r.data)

export const getStudentReportCard = (studentId, examId) =>
  api.get(`/students/${studentId}/report-card/`, { params: { exam: examId } }).then((r) => r.data)

export const getMyChildren = () =>
  api.get('/students/my-children/').then((r) => r.data)
