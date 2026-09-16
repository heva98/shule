import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNavItems } from '../../hooks/useNavItems'

export default function QuickSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const { regularItems, adminItems } = useNavItems()

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const q = query.trim().toLowerCase()
  const matches = q.length === 0
    ? []
    : [...regularItems, ...adminItems].filter(item => item.label.toLowerCase().includes(q)).slice(0, 6)

  function goTo(item) {
    navigate(item.path)
    setQuery('')
    setOpen(false)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (matches[0]) goTo(matches[0])
  }

  return (
    <div className="relative hidden md:block" ref={ref}>
      <form onSubmit={handleSubmit} className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search modules…"
          className="w-56 lg:w-72 border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-sm bg-gray-50
            focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-colors"
        />
      </form>

      {open && matches.length > 0 && (
        <div className="absolute left-0 mt-1.5 w-full bg-white rounded-xl border border-gray-100 shadow-card py-1.5 z-50">
          {matches.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.path}
                onClick={() => goTo(item)}
                className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
              >
                <Icon size={14} className="text-gray-400 shrink-0" />
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
