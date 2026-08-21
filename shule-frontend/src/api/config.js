import api from '../lib/axios'

export const getSchoolConfig = () =>
  api.get('/auth/school-config/').then(r => r.data)

export const getModuleConfig = () =>
  api.get('/config/').then(r => r.data)
