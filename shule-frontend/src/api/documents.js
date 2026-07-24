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

// Fetches the file as a blob through the authenticated endpoint — the JWT
// travels as an Authorization header (axios), which a plain <a href> download
// never would have sent. See documents/views.py:StudentDocumentDownloadView.
export const downloadStudentDocument = (id) =>
  api.get(`/documents/${id}/download/`, { responseType: 'blob' }).then((r) => r)
