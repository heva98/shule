import api from '../lib/axios'

export const getDormitories = (params = {}) =>
  api.get('/boarding/dormitories/', { params }).then((r) => r.data)

export const createDormitory = (data) =>
  api.post('/boarding/dormitories/', data).then((r) => r.data)

export const updateDormitory = (id, data) =>
  api.patch(`/boarding/dormitories/${id}/`, data).then((r) => r.data)

export const deleteDormitory = (id) =>
  api.delete(`/boarding/dormitories/${id}/`)

export const getBoardingAssignments = (params = {}) =>
  api.get('/boarding/assignments/', { params }).then((r) => r.data)

export const createBoardingAssignment = (data) =>
  api.post('/boarding/assignments/', data).then((r) => r.data)

export const vacateBoardingAssignment = (id) =>
  api.post(`/boarding/assignments/${id}/vacate/`).then((r) => r.data)

export const deleteBoardingAssignment = (id) =>
  api.delete(`/boarding/assignments/${id}/`)
