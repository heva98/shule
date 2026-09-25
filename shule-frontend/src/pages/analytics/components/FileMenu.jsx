import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../components/ui/Button'

function Item({ onClick, disabled, title, danger, children }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled} title={title}
      className={`block w-full text-left px-3 py-1.5 hover:bg-gray-50 disabled:text-gray-300 disabled:hover:bg-transparent ${danger ? 'text-danger' : ''}`}>
      {children}
    </button>
  )
}

const Divider = () => <div className="my-1 border-t border-gray-100" />

/**
 * The top bar's File menu. `saved` is the open saved visualization (or null);
 * `onAction` receives 'new' | 'open' | 'save' | 'saveAs' | 'rename' | 'pin' |
 * 'delete'.
 */
export default function FileMenu({ saved, canSave, onAction }) {
  const [open, setOpen] = useState(false)
  const owner = Boolean(saved?.is_owner)
  const ownerOnly = saved && !owner ? 'Only the person who saved it can change it; use Save as for your own copy.' : undefined

  function pick(action) {
    setOpen(false)
    onAction(action)
  }

  return (
    <div className="relative">
      <Button variant="outline" size="sm" icon={FolderOpen} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        File
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div role="menu" aria-label="File"
            className="absolute left-0 top-full mt-1 z-30 w-52 rounded-lg border border-gray-200 bg-white shadow-card py-1 text-sm text-gray-700">
            <Item onClick={() => pick('new')}>New</Item>
            <Item onClick={() => pick('open')}>Open…</Item>
            <Divider />
            <Item onClick={() => pick('save')} disabled={!canSave || (saved && !owner)} title={ownerOnly}>Save</Item>
            <Item onClick={() => pick('saveAs')} disabled={!canSave}>Save as…</Item>
            <Item onClick={() => pick('rename')} disabled={!owner} title={ownerOnly}>Rename…</Item>
            <Divider />
            <Item onClick={() => pick('pin')} disabled={!saved}
              title={saved ? undefined : 'Save the visualization before pinning it'}>
              {saved?.is_pinned ? 'Unpin from dashboard' : 'Pin to dashboard'}
            </Item>
            <Divider />
            <Item onClick={() => pick('delete')} disabled={!owner} title={ownerOnly} danger>Delete</Item>
          </div>
        </>
      )}
    </div>
  )
}
