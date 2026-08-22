import api from '../lib/axios'

export const getExams = (params = {}) =>
  api.get('/exams/', { params }).then((r) => r.data)

export const getExam = (id) =>
  api.get(`/exams/${id}/`).then((r) => r.data)

export const createExam = (data) =>
  api.post('/exams/', data).then((r) => r.data)

export const getSubjects = (params = {}) =>
  api.get('/exams/subjects/', { params }).then((r) => r.data)

// Spec-named aliases
export const bulkEnterMarks = (examId, data) =>
  api.post(`/exams/${examId}/marks/bulk/`, data).then((r) => r.data)

export const getResults = (examId) =>
  api.get(`/exams/${examId}/results/`).then((r) => r.data)

export const getRanking = (examId) =>
  api.get(`/exams/${examId}/ranking/`).then((r) => r.data)

export const getClassPerformance = (params = {}) =>
  api.get('/exams/class-performance/', { params }).then((r) => r.data)

export const getSubjectPerformance = (params = {}) =>
  api.get('/exams/subject-performance/', { params }).then((r) => r.data)

export const getMySubjects = () =>
  api.get('/exams/subjects/mine/').then((r) => r.data)

export const getSchoolPerformance = () =>
  api.get('/exams/school-performance/').then((r) => r.data)

export const getMySubjectPerformance = (params = {}) =>
  api.get('/exams/subject-performance/mine/', { params }).then((r) => r.data)

// Report card lives at the students endpoint — single source of truth in students.js
export { getStudentReportCard as getReportCard } from './students'

// Kept for backward compatibility
export const getExamResults = getResults
export const getExamRanking = getRanking
export const submitBulkMarks = bulkEnterMarks
