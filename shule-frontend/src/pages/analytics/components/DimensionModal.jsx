import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { getExamItems } from '../../../api/analytics'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import Tabs from '../../../components/ui/Tabs'
import { selectCls } from '../../../lib/formStyles'
import {
  AXES, AXIS_LABELS, FIXED_PERIOD_TYPES, fixedPeriods, flattenTree, periodLabel, placementError,
} from '../visualizationConfig'
import TransferList from './TransferList'

function DataHeader({ groups, group, onGroup }) {
  if (groups.length < 2) return null
  return (
    <select value={group} onChange={(e) => onGroup(e.target.value)} className={`${selectCls} w-full mb-2`}>
      <option value="">All groups</option>
      {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
    </select>
  )
}

function PeriodSelector({ dim, draft, setDraft }) {
  const [tab, setTab] = useState('relative')
  const years = useMemo(() => {
    const listed = dim.items.filter((i) => i.type === 'fixed').map((i) => Number(i.id))
    return listed.length ? listed : [new Date().getFullYear()]
  }, [dim.items])
  const [periodType, setPeriodType] = useState('TERM')
  const [year, setYear] = useState(years[0])

  const relative = dim.items.filter((i) => i.type === 'relative')
  const available = tab === 'relative'
    ? relative
    : fixedPeriods(periodType, year).map((id) => ({ id, label: periodLabel(id) }))
  const relativeLabels = Object.fromEntries(relative.map((i) => [i.id, i.label]))

  const header = (
    <>
      <div className="mb-3">
        <Tabs
          tabs={[{ id: 'relative', label: 'Relative periods' }, { id: 'fixed', label: 'Fixed periods' }]}
          active={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'fixed' && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={periodType} onChange={(e) => setPeriodType(e.target.value)} className={selectCls}
            aria-label="Period type">
            {FIXED_PERIOD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls}
            aria-label="Year">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}
    </>
  )

  return (
    <TransferList
      header={header}
      available={available}
      selected={draft}
      onChange={setDraft}
      labelFor={(id) => relativeLabels[id] ?? periodLabel(id)}
    />
  )
}

export default function DimensionModal({ dim, title, groups, selected, axis, onApply, onAddTo, onClose }) {
  const [draft, setDraft] = useState(selected)
  const [group, setGroup] = useState('')

  const isExam = dim.id === 'exam'
  const exams = useQuery({
    queryKey: ['analytics', 'exam-items'],
    queryFn: () => getExamItems(),
    enabled: isExam,
    staleTime: 5 * 60 * 1000,
  })

  const available = useMemo(() => {
    if (dim.kind === 'org_unit') return flattenTree(dim.items)
    if (isExam) return exams.data ?? []
    if (dim.kind === 'data') {
      return dim.items
        .filter((m) => !group || m.group === group)
        .map((m) => ({ id: m.id, label: m.label, description: m.description }))
    }
    return dim.items
  }, [dim, isExam, exams.data, group])

  const labels = useMemo(
    () => Object.fromEntries((dim.kind === 'org_unit' ? flattenTree(dim.items) : isExam ? exams.data ?? [] : dim.items)
      .map((i) => [i.id, i.label])),
    [dim, isExam, exams.data],
  )

  let body
  if (dim.kind === 'period') {
    body = <PeriodSelector dim={dim} draft={draft} setDraft={setDraft} />
  } else {
    body = (
      <TransferList
        header={dim.kind === 'data' ? <DataHeader groups={groups} group={group} onGroup={setGroup} /> : null}
        available={available}
        selected={draft}
        onChange={setDraft}
        labelFor={(id) => labels[id] ?? id}
        emptyText={isExam && exams.isLoading ? 'Loading exams…' : isExam && exams.isError ? 'Could not load exams.' : 'No items.'}
      />
    )
  }

  const dynamicHint = dim.kind === 'dynamic' && !dim.filter_only
    ? 'Leave empty to show every item when this dimension is in Columns or Rows.'
    : null

  return (
    <Modal isOpen onClose={onClose} title={title} size="xl">
      <div className="p-4 sm:p-6">
        {body}
        {dynamicHint && <p className="mt-3 text-xs text-gray-400">{dynamicHint}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 sm:px-6 py-4 border-t border-gray-100">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        {axis ? (
          <>
            <Button variant="outline" onClick={() => onApply(draft, false)}>Hide</Button>
            <Button onClick={() => onApply(draft, true)}>Update</Button>
          </>
        ) : (
          AXES.filter((a) => !placementError(dim, a)).map((a) => (
            <Button key={a} variant={a === 'filters' ? 'outline' : 'primary'} onClick={() => onAddTo(a, draft)}>
              Add to {AXIS_LABELS[a]}
            </Button>
          ))
        )}
      </div>
    </Modal>
  )
}
