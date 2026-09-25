import { useState } from 'react'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import { inputCls, selectCls } from '../../../lib/formStyles'
import { isChart } from '../visualizationConfig'

const LEGEND = 'text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2'

function Toggle({ checked, onChange, children }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="rounded border-gray-300 text-primary focus:ring-primary" />
      {children}
    </label>
  )
}

export default function OptionsModal({ type, options, onApply, onClose }) {
  const [draft, setDraft] = useState(options)
  // The target input is kept as typed and parsed on Apply.
  const [target, setTarget] = useState(options.targetValue ?? '')
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }))

  const chart = isChart(type)
  const hasTarget = chart && type !== 'PIE'
  const targetNumber = String(target).trim() === '' ? null : Number(target)
  const targetInvalid = targetNumber !== null && !Number.isFinite(targetNumber)

  return (
    <Modal isOpen onClose={onClose} title="Options" size="sm">
      <div className="p-6 space-y-5">
        <fieldset className="space-y-2">
          <legend className={LEGEND}>Display</legend>
          {!chart && (
            <Toggle checked={draft.showDimensionLabels} onChange={(v) => set('showDimensionLabels', v)}>
              Show dimension labels
            </Toggle>
          )}
          {chart && type !== 'SINGLE_VALUE' && (
            <Toggle checked={draft.showDataLabels} onChange={(v) => set('showDataLabels', v)}>
              Show data labels
            </Toggle>
          )}
          {type !== 'SINGLE_VALUE' && (
            <>
              <Toggle checked={draft.hideEmptyRows} onChange={(v) => set('hideEmptyRows', v)}>
                {chart ? 'Hide empty categories' : 'Hide empty rows'}
              </Toggle>
              <Toggle checked={draft.hideEmptyColumns} onChange={(v) => set('hideEmptyColumns', v)}>
                {chart ? 'Hide empty series' : 'Hide empty columns'}
              </Toggle>
            </>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-gray-700">
            <span className={`block ${LEGEND}`}>Decimal places</span>
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
          {chart && type !== 'SINGLE_VALUE' && (
            <label className="block text-sm text-gray-700">
              <span className={`block ${LEGEND}`}>Sort order</span>
              <select value={draft.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} className={`${selectCls} w-full`}>
                <option value="none">As selected</option>
                <option value="asc">Low to high</option>
                <option value="desc">High to low</option>
              </select>
            </label>
          )}
        </div>

        {hasTarget && (
          <fieldset>
            <legend className={LEGEND}>Target line</legend>
            <div className="grid grid-cols-[6rem_1fr] gap-3">
              <label className="block">
                <span className="sr-only">Target value</span>
                <input type="number" inputMode="decimal" step="any" value={target} placeholder="e.g. 50"
                  onChange={(e) => setTarget(e.target.value)}
                  className={`${inputCls} w-full ${targetInvalid ? 'border-danger' : ''}`} />
              </label>
              <label className="block">
                <span className="sr-only">Target label</span>
                <input value={draft.targetLabel} placeholder="Pass mark" maxLength={40}
                  onChange={(e) => set('targetLabel', e.target.value)} className={`${inputCls} w-full`} />
              </label>
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              {type === 'SINGLE_VALUE'
                ? 'Shows how far the value is above or below this number.'
                : 'Draws a dashed line at this value, e.g. 50 for a 50% pass mark. Leave empty for none.'}
            </p>
          </fieldset>
        )}
      </div>
      <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={targetInvalid}
          onClick={() => onApply(hasTarget ? { ...draft, targetValue: targetNumber } : draft)}>
          Apply
        </Button>
      </div>
    </Modal>
  )
}
