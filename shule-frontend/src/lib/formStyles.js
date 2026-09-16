// Shared form control styling — import these instead of redefining
// local `inputCls` / `selectCls` / `textareaCls` constants per page.
// No `w-full` baked in: form-grid usages append it (`${inputCls} w-full`),
// inline filter bars (which size to their content) use it as-is.
export const inputCls =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 ' +
  'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary ' +
  'disabled:bg-gray-50 disabled:text-gray-500'

export const selectCls = `${inputCls} bg-white`

export const textareaCls = `${inputCls} resize-none`
