import { ChevronDown, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useNavItems } from '../../hooks/useNavItems'
import logo from '../../assets/ShuleSMSLogo.png'
import { ROLE_LABEL } from '../../lib/constants'

// `collapsed` shrinks the sidebar to an icon rail (desktop only — the mobile
// drawer always renders expanded). Labels stay in the DOM but are hidden, and
// each link gets a native tooltip so icon-only items remain identifiable.
function NavItem({ item, onClose, collapsed }) {
  const Icon = item.icon
  return (
    <NavLink
      key={item.path}
      to={item.path}
      end={item.path === '/admin-panel' || item.path === '/dashboard'}
      onClick={onClose}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `relative flex items-center rounded-md text-sm transition-colors ${
          collapsed ? 'justify-center px-0 py-3' : 'gap-3 pl-5 pr-3 py-3'
        } ${
          isActive
            ? 'bg-black/25 text-white font-semibold before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-primary'
            : 'text-white/70 hover:bg-white/5 hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={18} className={`shrink-0 ${isActive ? 'text-primary' : 'text-white/60'}`} />
          {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  )
}

// A child is active when the path matches it or nests under it, unless a
// sibling matches more specifically (/exams/reports must not also light up
// "Exams", while /exams/5/marks still does).
function isChildActive(child, siblings, pathname) {
  const matches = (p) => pathname === p || pathname.startsWith(`${p}/`)
  if (!matches(child.path)) return false
  return !siblings.some(o => o !== child && o.path.length > child.path.length && matches(o.path))
}

// Collapsible parent with bulleted children. In the icon rail there's no room
// for the submenu, so clicking the icon expands the sidebar and opens it.
function NavGroup({ group, onClose, collapsed, onExpand }) {
  const { pathname } = useLocation()
  const Icon = group.icon
  const anyActive = group.children.some(c => isChildActive(c, group.children, pathname))
  const [open, setOpen] = useState(anyActive)

  // Navigating to a child (e.g. from quick search) should reveal it.
  useEffect(() => {
    if (anyActive) setOpen(true)
  }, [anyActive])

  function handleClick() {
    if (collapsed) {
      setOpen(true)
      onExpand?.()
    } else {
      setOpen(o => !o)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        title={collapsed ? group.label : undefined}
        aria-expanded={open && !collapsed}
        className={`relative w-full flex items-center rounded-md text-sm transition-colors ${
          collapsed ? 'justify-center px-0 py-3' : 'gap-3 pl-5 pr-4 py-3'
        } ${
          anyActive
            ? 'text-white font-semibold'
            : 'text-white/70 hover:bg-white/5 hover:text-white'
        } ${anyActive && collapsed ? 'bg-black/25 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-primary' : ''}`}
      >
        <Icon size={18} className={`shrink-0 ${anyActive ? 'text-primary' : 'text-white/60'}`} />
        {!collapsed && (
          <>
            <span className="flex-1 text-left truncate">{group.label}</span>
            <ChevronDown
              size={14}
              className={`shrink-0 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </>
        )}
      </button>

      {!collapsed && open && (
        <div className="py-1">
          {group.children.map(child => {
            const active = isChildActive(child, group.children, pathname)
            return (
              <NavLink
                key={child.path}
                to={child.path}
                onClick={onClose}
                className={`flex items-center gap-3 pl-[26px] pr-3 py-2.5 text-sm transition-colors ${
                  active ? 'text-white font-semibold' : 'text-white/60 hover:text-white'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-primary' : 'bg-white/30'}`}
                />
                <span className="truncate">{child.label}</span>
              </NavLink>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ onClose, collapsed = false, onExpand }) {
  const { user } = useAuth()
  const { regularItems, navEntries, adminItems, showAdmin } = useNavItems()
  const role = user?.role ?? ''

  return (
    <aside
      className={`flex flex-col h-full bg-sidebar text-white shrink-0 transition-[width] duration-300 ${
        collapsed ? 'w-[75px]' : 'w-64'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center h-14 shrink-0 border-b border-white/10 ${
          collapsed ? 'justify-center px-2' : 'justify-between px-5'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <img src={logo} alt="Shule SMS" className="w-9 h-9 rounded-lg object-contain shrink-0 bg-white" />
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-semibold text-sm leading-tight truncate">Shule SMS</div>
              <div className="text-xs text-white/50 truncate">School Management</div>
            </div>
          )}
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
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-0.5">
        {navEntries.map(entry =>
          entry.type === 'group' ? (
            <NavGroup
              key={entry.key}
              group={entry}
              onClose={onClose}
              collapsed={collapsed}
              onExpand={onExpand}
            />
          ) : (
            <NavItem key={entry.path} item={entry} onClose={onClose} collapsed={collapsed} />
          )
        )}

        {/* Admin nav section */}
        {showAdmin && (
          <>
            {regularItems.length > 0 && (
              <div className="pt-4 pb-2">
                {collapsed ? (
                  <div className="h-px bg-white/10 mx-4" />
                ) : (
                  <p className="px-5 text-[11px] font-semibold text-white/40 uppercase tracking-widest">
                    Admin Panel
                  </p>
                )}
              </div>
            )}
            {adminItems.map(item => (
              <NavItem key={item.path} item={item} onClose={onClose} collapsed={collapsed} />
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div
        className={`border-t border-white/10 py-3 flex items-center ${
          collapsed ? 'justify-center px-2' : 'gap-3 px-5'
        }`}
        title={collapsed ? user?.full_name : undefined}
      >
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-semibold shrink-0">
          {user?.full_name?.[0]?.toUpperCase() ?? 'U'}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{user?.full_name ?? 'User'}</div>
            <span className="text-[10px] text-white/50">{ROLE_LABEL[role] ?? role}</span>
          </div>
        )}
      </div>
    </aside>
  )
}
