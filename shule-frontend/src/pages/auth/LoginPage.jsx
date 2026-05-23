import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const ROLE_PATHS = {
  OWNER: '/dashboard',
  HEADTEACHER: '/dashboard',
  TEACHER: '/attendance',
  BURSAR: '/fees',
  PARENT: '/parent',
  STUDENT: '/parent',
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm()

  const onSubmit = async ({ email, password }) => {
    setServerError('')
    try {
      const user = await login(email, password)
      navigate(ROLE_PATHS[user.role] ?? '/dashboard', { replace: true })
    } catch (err) {
      setServerError(
        err.response?.data?.detail ??
          err.response?.data?.non_field_errors?.[0] ??
          'Invalid email or password.'
      )
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary mx-auto flex items-center justify-center mb-4 shadow-lg">
            <span className="text-2xl font-bold text-white">S</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Shule SMS</h1>
          <p className="text-sm text-gray-500 mt-1">School Management System</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-5">Sign in to your account</h2>

          {serverError && (
            <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 text-danger text-sm rounded-lg">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@school.ac.tz"
                className={`w-full px-3 py-2.5 border rounded-lg text-sm transition-colors
                  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                  ${errors.email ? 'border-danger bg-red-50' : 'border-gray-300'}`}
                {...register('email', {
                  required: 'Email is required',
                  pattern: { value: /\S+@\S+\.\S+/, message: 'Enter a valid email address' },
                })}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-danger">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className={`w-full px-3 py-2.5 border rounded-lg text-sm transition-colors
                  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                  ${errors.password ? 'border-danger bg-red-50' : 'border-gray-300'}`}
                {...register('password', { required: 'Password is required' })}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-primary hover:bg-secondary text-white rounded-lg
                text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed
                flex items-center justify-center gap-2 mt-2"
            >
              {isSubmitting && (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Shule SMS &middot; Private School Management &middot; Tanzania
        </p>
      </div>
    </div>
  )
}
