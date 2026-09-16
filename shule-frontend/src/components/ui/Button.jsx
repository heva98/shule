import { forwardRef } from 'react'

const VARIANT_CLS = {
  primary: 'bg-primary text-white hover:bg-secondary disabled:opacity-60',
  outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60',
  danger:  'bg-danger text-white hover:bg-red-700 disabled:opacity-60',
  ghost:   'text-gray-600 hover:bg-gray-100 disabled:opacity-60',
}

const SIZE_CLS = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
}

const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', icon: Icon, className = '', children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors ${VARIANT_CLS[variant] ?? VARIANT_CLS.primary} ${SIZE_CLS[size] ?? SIZE_CLS.md} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} className="shrink-0" />}
      {children}
    </button>
  )
})

export default Button
