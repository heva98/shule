import api from '../lib/axios'

export const generateCharges = (data) =>
  api.post('/fees/charges/generate/', data).then((r) => r.data)

export const assignUniform = (data) =>
  api.post('/fees/charges/assign-uniform/', data).then((r) => r.data)

export const getStudentFeeSummary = (params = {}) =>
  api.get('/fees/student-summary/', { params }).then((r) => r.data)

export const getInvoiceLines = (params = {}) =>
  api.get('/fees/invoice-lines/', { params }).then((r) => r.data)

export const voidInvoiceLine = (id, reason) =>
  api.post(`/fees/invoice-lines/${id}/void/`, { reason }).then((r) => r.data)

export const createInvoiceLine = (data) =>
  api.post('/fees/invoice-lines/', data).then((r) => r.data)

export const getStudentCredits = (params = {}) =>
  api.get('/fees/credits/', { params }).then((r) => r.data)

export const getPayments = (params = {}) =>
  api.get('/fees/payments/', { params }).then((r) => r.data)

export const reversePayment = (id, reason) =>
  api.post(`/fees/payments/${id}/reverse/`, { reason }).then((r) => r.data)
