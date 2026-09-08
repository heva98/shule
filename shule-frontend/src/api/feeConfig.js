import api from '../lib/axios'

// ── Tuition plans (annual) ────────────────────────────────────────────────
export const getTuitionPlans = (params = {}) =>
  api.get('/fees/config/tuition/', { params }).then((r) => r.data)
export const createTuitionPlan = (data) =>
  api.post('/fees/config/tuition/', data).then((r) => r.data)
export const updateTuitionPlan = (id, data) =>
  api.patch(`/fees/config/tuition/${id}/`, data).then((r) => r.data)
export const deleteTuitionPlan = (id) => api.delete(`/fees/config/tuition/${id}/`)

// ── Uniform plans (annual, per class) ─────────────────────────────────────
export const getUniformPlans = (params = {}) =>
  api.get('/fees/config/uniform/', { params }).then((r) => r.data)
export const createUniformPlan = (data) =>
  api.post('/fees/config/uniform/', data).then((r) => r.data)
export const updateUniformPlan = (id, data) =>
  api.patch(`/fees/config/uniform/${id}/`, data).then((r) => r.data)
export const deleteUniformPlan = (id) => api.delete(`/fees/config/uniform/${id}/`)

// ── Lunch config (quarterly, school-wide) ─────────────────────────────────
export const getLunchConfigs = (params = {}) =>
  api.get('/fees/config/lunch/', { params }).then((r) => r.data)
export const createLunchConfig = (data) =>
  api.post('/fees/config/lunch/', data).then((r) => r.data)
export const updateLunchConfig = (id, data) =>
  api.patch(`/fees/config/lunch/${id}/`, data).then((r) => r.data)
export const deleteLunchConfig = (id) => api.delete(`/fees/config/lunch/${id}/`)

// ── Activity plans (quarterly, per class) ─────────────────────────────────
export const getActivityPlans = (params = {}) =>
  api.get('/fees/config/activity/', { params }).then((r) => r.data)
export const createActivityPlan = (data) =>
  api.post('/fees/config/activity/', data).then((r) => r.data)
export const updateActivityPlan = (id, data) =>
  api.patch(`/fees/config/activity/${id}/`, data).then((r) => r.data)
export const deleteActivityPlan = (id) => api.delete(`/fees/config/activity/${id}/`)

// ── Config preview for one student ───────────────────────────────────────
export const resolveFeeConfig = (params = {}) =>
  api.get('/fees/config/resolve/', { params }).then((r) => r.data)
