import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

// AuthProvider registers a callback here so it can clear its in-memory
// user/token state on a 401. Without this, a stale token in localStorage
// would 401 on the silent background /auth/me check and hard-redirect
// visitors away from public pages (e.g. the landing page at "/") — the
// redirect belongs to ProtectedRoute, which only fires for routes that
// actually require auth.
let onUnauthorized = () => {}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('shule_access')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('shule_access')
      localStorage.removeItem('shule_refresh')
      onUnauthorized()
    }
    return Promise.reject(error)
  }
)

export default api
