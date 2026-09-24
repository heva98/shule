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

// Year-by-year class history (students.Enrolment), newest first.
export const getStudentEnrolments = (id) =>
  api.get(`/students/${id}/enrolments/`).then((r) => r.data)

export const getStudentGuardians = (id) =>
  api.get(`/students/${id}/guardians/`).then((r) => r.data)

export const addGuardian = (studentId, data) =>
  api.post(`/students/${studentId}/guardians/`, data).then((r) => r.data)

export const updateGuardian = (id, data) =>
  api.patch(`/students/guardians/${id}/`, data).then((r) => r.data)

export const deleteGuardian = (id) =>
  api.delete(`/students/guardians/${id}/`)

export const getStudentReportCard = (studentId, examId) =>
  api.get(`/students/${studentId}/report-card/`, { params: { exam: examId } }).then((r) => r.data)

// PDF report card (server-rendered from exams/report_card.html), for a real
// download/print rather than the JS-built print view above.
export const downloadStudentReportCardPdf = async (studentId, examId, filename) => {
  const res = await api.get(`/students/${studentId}/report-card/pdf/`, {
    params: { exam: examId },
    responseType: 'blob',
  })
  const url = window.URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'report-card.pdf'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

export const getMyChildren = () =>
  api.get('/students/my-children/').then((r) => r.data)

// Managed stream names (e.g. A, B, BLUE) for stream pickers.
export const getStreams = () =>
  api.get('/students/streams/').then((r) => r.data)
