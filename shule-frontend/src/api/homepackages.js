import api from '../lib/axios'

export const getHomePackages = (params = {}) =>
  api.get('/homepackages/', { params }).then((r) => r.data)

export const createHomePackage = (formData) =>
  api
    .post('/homepackages/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)

export const updateHomePackage = (id, formData) =>
  api
    .patch(`/homepackages/${id}/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)

export const deleteHomePackage = (id) =>
  api.delete(`/homepackages/${id}/`)
