import { X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useNavItems } from '../../hooks/useNavItems'
import logo from '../../assets/ShuleSMSLogo.png'
import { ROLE_LABEL } from '../../lib/constants'

function NavItem({ item, onClose }) {
  const Icon = item.icon
  return (
    <NavLink
      key={item.path}
      to={item.path}
      end={item.path === '/admin-panel' || item.path === '/dashboard'}
      onClick={onClose}
      className={({ isActive }) =>
        `relative flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-lg text-sm transition-colors ${
          isActive
            ? 'bg-white/20 text-white font-semibold shadow-sm before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-full before:bg-accent'
            : 'text-white/70 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-colors ${
            isActive ? 'bg-accent/20 text-accent' : 'text-white/60'
          }`}>
            <Icon size={16} />
          </span>
          <span className="flex-1">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar({ onClose }) {
  const { user } = useAuth()
  const { regularItems, adminItems, showAdmin } = useNavItems()
  const role = user?.role ?? ''

  return (
    <aside className="flex flex-col h-full bg-primary text-white w-64 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-white/20">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Shule SMS" className="w-9 h-9 rounded-lg object-contain shrink-0 bg-white" />
          <div>
            <div className="font-semibold text-sm leading-tight">Shule SMS</div>
            <div className="text-xs text-white/60">School Management</div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {/* Regular nav */}
        {regularItems.map(item => (
          <NavItem key={item.path} item={item} onClose={onClose} />
        ))}

        {/* Admin nav section */}
        {showAdmin && (
          <>
            {regularItems.length > 0 && (
              <div className="pt-3 pb-1">
                <div className="h-px bg-white/10 mb-3" />
                <p className="px-3 text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-1">
                  Admin Panel
                </p>
              </div>
            )}
            {adminItems.map(item => (
              <NavItem key={item.path} item={item} onClose={onClose} />
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/20 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-xs font-semibold shrink-0">
          {user?.full_name?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{user?.full_name ?? 'User'}</div>
          <span className="text-[10px] text-white/50">{ROLE_LABEL[role] ?? role}</span>
        </div>
      </div>
    </aside>
  )
}
