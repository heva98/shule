import { useState } from 'react'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import { selectCls } from '../../../lib/formStyles'

const TOGGLES = [
  ['showDimensionLabels', 'Show dimension labels'],
  ['hideEmptyRows', 'Hide empty rows'],
  ['hideEmptyColumns', 'Hide empty columns'],
]

export default function OptionsModal({ options, onApply, onClose }) {
  const [draft, setDraft] = useState(options)
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }))

  return (
    <Modal isOpen onClose={onClose} title="Options" size="sm">
      <div className="p-6 space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Display</legend>
          {TOGGLES.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={draft[key]} onChange={(e) => set(key, e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary" />
              {label}
            </label>
          ))}
        </fieldset>
        <label className="block text-sm text-gray-700">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Decimal places</span>
          <select
            value={String(draft.decimals)}
            onChange={(e) => set('decimals', e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
            className={`${selectCls} w-full`}
          >
            <option value="auto">Automatic</option>
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onApply(draft)}>Apply</Button>
      </div>
    </Modal>
  )
}
