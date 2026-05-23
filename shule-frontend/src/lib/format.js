const tzFormatter = new Intl.NumberFormat('en-TZ', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function formatTZS(value) {
  const num = parseFloat(value) || 0
  return `TZS ${tzFormatter.format(Math.round(num))}`
}
