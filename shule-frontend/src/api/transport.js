import api from '../lib/axios'

export const getRoutes = (params = {}) =>
  api.get('/transport/routes/', { params }).then((r) => r.data)

export const createRoute = (data) =>
  api.post('/transport/routes/', data).then((r) => r.data)

export const updateRoute = (id, data) =>
  api.patch(`/transport/routes/${id}/`, data).then((r) => r.data)

export const deleteRoute = (id) =>
  api.delete(`/transport/routes/${id}/`)

export const getPickupPoints = (params = {}) =>
  api.get('/transport/pickup-points/', { params }).then((r) => r.data)

export const createPickupPoint = (data) =>
  api.post('/transport/pickup-points/', data).then((r) => r.data)

export const updatePickupPoint = (id, data) =>
  api.patch(`/transport/pickup-points/${id}/`, data).then((r) => r.data)

export const deletePickupPoint = (id) =>
  api.delete(`/transport/pickup-points/${id}/`)

export const getRouteFees = (params = {}) =>
  api.get('/transport/fees/', { params }).then((r) => r.data)

export const createRouteFee = (data) =>
  api.post('/transport/fees/', data).then((r) => r.data)

export const updateRouteFee = (id, data) =>
  api.patch(`/transport/fees/${id}/`, data).then((r) => r.data)

export const deleteRouteFee = (id) =>
  api.delete(`/transport/fees/${id}/`)

export const getTransportAssignments = (params = {}) =>
  api.get('/transport/assignments/', { params }).then((r) => r.data)

export const createTransportAssignment = (data) =>
  api.post('/transport/assignments/', data).then((r) => r.data)

export const vacateTransportAssignment = (id) =>
  api.post(`/transport/assignments/${id}/vacate/`).then((r) => r.data)

export const deleteTransportAssignment = (id) =>
  api.delete(`/transport/assignments/${id}/`)
