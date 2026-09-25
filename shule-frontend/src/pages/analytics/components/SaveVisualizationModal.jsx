import { useState } from 'react'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import { inputCls, textareaCls } from '../../../lib/formStyles'

/**
 * Name, description and sharing for Save / Save as / Rename. `onSubmit`
 * returns a promise; a rejection's message is shown in the dialog.
 */
export default function SaveVisualizationModal({ title, submitLabel, initial, onSubmit, onClose }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [shared, setShared] = useState(initial?.shared_with_staff ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Give the visualization a name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ name: name.trim(), description: description.trim(), shared_with_staff: shared })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={title} size="sm">
      <form onSubmit={submit} className="p-6 space-y-4">
        <label className="block text-sm">
          <span className="block font-medium text-gray-700 mb-1">Name</span>
          <input autoFocus value={name} maxLength={150} onChange={(e) => setName(e.target.value)}
            className={`${inputCls} w-full`} />
        </label>
        <label className="block text-sm">
          <span className="block font-medium text-gray-700 mb-1">
            Description <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
            className={`${textareaCls} w-full`} />
        </label>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-primary focus:ring-primary" />
          <span>
            Share with staff
            <span className="block text-xs text-gray-500">
              Other analytics staff can open and pin it. Each person only sees the data their role allows.
            </span>
          </span>
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button>
        </div>
      </form>
    </Modal>
  )
}
