import api from '../lib/axios'

export const getExams = (params = {}) =>
  api.get('/exams/', { params }).then((r) => r.data)

export const getExam = (id) =>
  api.get(`/exams/${id}/`).then((r) => r.data)

export const createExam = (data) =>
  api.post('/exams/', data).then((r) => r.data)

export const getExamResults = (examId) =>
  api.get(`/exams/${examId}/results/`).then((r) => r.data)

export const getExamRanking = (examId) =>
  api.get(`/exams/${examId}/ranking/`).then((r) => r.data)

export const submitBulkMarks = (examId, data) =>
  api.post(`/exams/${examId}/marks/bulk/`, data).then((r) => r.data)

export const getSubjects = (params = {}) =>
  api.get('/exams/subjects/', { params }).then((r) => r.data)
