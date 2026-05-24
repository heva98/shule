import api from '../lib/axios'

export const getInvoices = (params = {}) =>
  api.get('/fees/invoices/', { params }).then((r) => r.data)

export const getInvoice = (id) =>
  api.get(`/fees/invoices/${id}/`).then((r) => r.data)

export const createInvoice = (data) =>
  api.post('/fees/invoices/', data).then((r) => r.data)

export const generateInvoices = (data) =>
  api.post('/fees/invoices/generate/', data).then((r) => r.data)

export const recordPayment = (data) =>
  api.post('/fees/payments/', data).then((r) => r.data)

export const getReceipt = (paymentId) =>
  api.get(`/fees/payments/${paymentId}/receipt/`).then((r) => r.data)

export const getFeeSummary = (params = {}) =>
  api.get('/fees/summary/', { params }).then((r) => r.data)

export const getMonthlyRevenue = (params = {}) =>
  api.get('/fees/summary/monthly/', { params }).then((r) => r.data)

export const getDefaulters = (params = {}) =>
  api.get('/fees/defaulters/', { params }).then((r) => r.data)

export const getFeeStructures = (params = {}) =>
  api.get('/fees/structures/', { params }).then((r) => r.data)

export const createFeeStructure = (data) =>
  api.post('/fees/structures/', data).then((r) => r.data)

export const updateFeeStructure = (id, data) =>
  api.patch(`/fees/structures/${id}/`, data).then((r) => r.data)

export const deleteFeeStructure = (id) =>
  api.delete(`/fees/structures/${id}/`)

export const getAcademicYears = () =>
  api.get('/fees/academic-years/').then((r) => r.data)

export const createAcademicYear = (data) =>
  api.post('/fees/academic-years/', data).then((r) => r.data)

export const updateAcademicYear = (id, data) =>
  api.patch(`/fees/academic-years/${id}/`, data).then((r) => r.data)
