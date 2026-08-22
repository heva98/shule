import api from '../lib/axios'

export const getSchoolConfig = () =>
  api.get('/auth/school-config/').then(r => r.data)
