import api from '../lib/axios'

export const getBooks = (params = {}) =>
  api.get('/library/books/', { params }).then((r) => r.data)

export const createBook = (data) =>
  api.post('/library/books/', data).then((r) => r.data)

export const updateBook = (id, data) =>
  api.patch(`/library/books/${id}/`, data).then((r) => r.data)

export const deleteBook = (id) =>
  api.delete(`/library/books/${id}/`)

export const getBorrowRecords = (params = {}) =>
  api.get('/library/borrow-records/', { params }).then((r) => r.data)

export const createBorrowRecord = (data) =>
  api.post('/library/borrow-records/', data).then((r) => r.data)

export const returnBook = (id) =>
  api.post(`/library/borrow-records/${id}/return/`).then((r) => r.data)

export const markBookLost = (id) =>
  api.post(`/library/borrow-records/${id}/mark-lost/`).then((r) => r.data)
