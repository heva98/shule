import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import api from '../lib/axios'

const AuthContext = createContext(null)

function decodeJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('shule_access'))
  const [loading, setLoading] = useState(!!localStorage.getItem('shule_access'))

  useEffect(() => {
    const token = localStorage.getItem('shule_access')
    if (!token) return

    api
      .get('/auth/me/')
      .then(({ data }) => setUser(data))
      .catch((err) => {
        if (err.response?.status === 404) {
          const payload = decodeJwt(token)
          if (payload) {
            setUser({ id: payload.user_id, role: payload.role ?? 'TEACHER' })
          } else {
            localStorage.removeItem('shule_access')
            localStorage.removeItem('shule_refresh')
            setAccessToken(null)
          }
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login/', { email, password })
    localStorage.setItem('shule_access', data.access)
    if (data.refresh) localStorage.setItem('shule_refresh', data.refresh)
    setAccessToken(data.access)

    let profile = data.user ?? null
    if (!profile) {
      const { data: me } = await api.get('/auth/me/')
      profile = me
    }
    setUser(profile)
    return profile
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('shule_access')
    localStorage.removeItem('shule_refresh')
    setUser(null)
    setAccessToken(null)
    window.location.href = '/login'
  }, [])

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
