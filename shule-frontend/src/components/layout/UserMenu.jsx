import { ChevronDown, HelpCircle, LogOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABEL } from '../../lib/constants'

export default function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const role = user?.role ?? ''

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold shrink-0">
          {user?.full_name?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <span className="hidden sm:flex flex-col items-start leading-none">
          <span className="text-sm text-gray-700 font-medium">{user?.full_name}</span>
          <span className="text-[10px] text-gray-400">{ROLE_LABEL[role] ?? role}</span>
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl border border-gray-100 shadow-card py-1.5 z-50">
          <div className="px-3.5 py-2 border-b border-gray-100">
            <div className="text-sm font-medium text-gray-800 truncate">{user?.full_name}</div>
            <div className="text-xs text-gray-400 truncate">{user?.email}</div>
          </div>
          <a
            href="/manual"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <HelpCircle size={15} />
            User Manual
          </a>
          <button
            onClick={logout}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-danger hover:bg-red-50 transition-colors"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
