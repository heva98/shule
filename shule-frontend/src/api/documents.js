import api from '../lib/axios'

export const getStudentDocuments = (params = {}) =>
  api.get('/documents/', { params }).then((r) => r.data)

export const createStudentDocument = (formData) =>
  api
    .post('/documents/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)

export const deleteStudentDocument = (id) =>
  api.delete(`/documents/${id}/`)
