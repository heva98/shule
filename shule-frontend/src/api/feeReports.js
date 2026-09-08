import api from '../lib/axios'

export const getFeeOverview = (params = {}) =>
  api.get('/fees/reports/overview/', { params }).then((r) => r.data)

export const getFeeCollections = (params = {}) =>
  api.get('/fees/reports/collections/', { params }).then((r) => r.data)

export const getFeeOutstanding = (params = {}) =>
  api.get('/fees/reports/outstanding/', { params }).then((r) => r.data)

export const getFeeUnpaidStudents = (params = {}) =>
  api.get('/fees/reports/unpaid/', { params }).then((r) => r.data)
