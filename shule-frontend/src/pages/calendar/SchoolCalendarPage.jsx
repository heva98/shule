import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays, ChevronDown, Download, Pencil, Plus, Trash2,
} from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import api from '../../lib/axios'
import {
  createCalendarEvent, deleteCalendarEvent,
  getCalendarEvents, updateCalendarEvent,
} from '../../api/sysadmin'
import Modal from '../../components/ui/Modal'
import { useAuth } from '../../context/AuthContext'

// ── Constants ─────────────────────────────────────────────────────────────────

const CALENDAR_MANAGERS = ['OWNER', 'SYSTEM_ADMIN', 'HEADTEACHER', 'ACADEMIC_TEACHER']

const QUARTERS = [
  { key: 'q1', label: 'Q1', term: 'Term 1', hint: 'Jan – Mar' },
  { key: 'q2', label: 'Q2', term: 'Term 1', hint: 'Apr – Jun' },
  { key: 'q3', label: 'Q3', term: 'Term 2', hint: 'Jul – Sep' },
  { key: 'q4', label: 'Q4', term: 'Term 2', hint: 'Oct – Nov' },
]

const EVENT_TYPES = [
  { value: 'HOLIDAY',  label: 'Public Holiday',  color: 'bg-red-100 text-red-700' },
  { value: 'EXAM',     label: 'Examination',      color: 'bg-blue-100 text-blue-700' },
  { value: 'SPORTS',   label: 'Sports & Games',   color: 'bg-green-100 text-green-700' },
  { value: 'MEETING',  label: 'Meeting',          color: 'bg-gray-100 text-gray-700' },
  { value: 'TRIP',     label: 'School Trip',      color: 'bg-purple-100 text-purple-700' },
  { value: 'CEREMONY', label: 'Ceremony',         color: 'bg-yellow-100 text-yellow-700' },
  { value: 'OTHER',    label: 'Other',            color: 'bg-slate-100 text-slate-600' },
]

function eventTypeColor(type) {
  return EVENT_TYPES.find(t => t.value === type)?.color ?? 'bg-slate-100 text-slate-600'
}
function eventTypeLabel(type) {
  return EVENT_TYPES.find(t => t.value === type)?.label ?? type
}

// ── Date helpers ─────────────────────────────────────────────────────────────

// Normalise whatever the browser's date input returns → YYYY-MM-DD.
// Most browsers already return YYYY-MM-DD, but some locales return DD/MM/YYYY.
function normalizeDate(v) {
  if (!v) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v           // already ISO
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {                // DD/MM/YYYY
    const [d, m, y] = v.split('/')
    return `${y}-${m}-${d}`
  }
  return v
}

function fmtDate(d) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('en-TZ', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}
function fmtRange(start, end) {
  if (!start && !end) return '—'
  const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-TZ', { day: 'numeric', month: 'short' }) : '?'
  return `${fmt(start)} – ${fmt(end)}`
}

// ── PDF export ────────────────────────────────────────────────────────────────

async function downloadCalendarPDF(activeYear, events, grouped) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  // Header
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('School Calendar', pageW / 2, 18, { align: 'center' })

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text(`Academic Year: ${activeYear.year}`, pageW / 2, 26, { align: 'center' })
  doc.setTextColor(0)

  // Terms & Quarters table
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Terms & Quarters', 14, 36)

  autoTable(doc, {
    startY: 40,
    head: [['Quarter', 'Term', 'Dates']],
    body: QUARTERS.map(q => [
      `${q.label} (${q.hint})`,
      q.term,
      fmtRange(activeYear[`${q.key}_start`], activeYear[`${q.key}_end`]),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [59, 130, 246] },
    margin: { left: 14, right: 14 },
  })

  // Events table
  const quartersEndY = doc.lastAutoTable.finalY + 10

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('School Events', 14, quartersEndY)

  if (events.length === 0) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120)
    doc.text('No events scheduled for this year.', 14, quartersEndY + 8)
  } else {
    const rows = []
    for (const [, evs] of grouped) {
      for (const ev of evs) {
        rows.push([
          fmtDate(ev.start_date),
          ev.end_date && ev.end_date !== ev.start_date ? fmtDate(ev.end_date) : '—',
          ev.title,
          eventTypeLabel(ev.event_type),
          ev.description || '—',
        ])
      }
    }

    autoTable(doc, {
      startY: quartersEndY + 4,
      head: [['Start', 'End', 'Event', 'Type', 'Description']],
      body: rows,
      styles: { fontSize: 8, overflow: 'linebreak' },
      headStyles: { fillColor: [59, 130, 246] },
      columnStyles: { 4: { cellWidth: 60 } },
      margin: { left: 14, right: 14 },
    })
  }

  // Footer
  const pageCount = doc.internal.getNumberOfPages()
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(150)
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.text(
      `Generated ${new Date().toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}  •  Page ${i} of ${pageCount}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' },
    )
  }

  doc.save(`school-calendar-${activeYear.year}.pdf`)
}

// ── Edit quarters modal ───────────────────────────────────────────────────────

const dateCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30'

function EditQuartersModal({ year, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    q1_start: year.q1_start ?? '', q1_end: year.q1_end ?? '',
    q2_start: year.q2_start ?? '', q2_end: year.q2_end ?? '',
    q3_start: year.q3_start ?? '', q3_end: year.q3_end ?? '',
    q4_start: year.q4_start ?? '', q4_end: year.q4_end ?? '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: normalizeDate(v) }))

  const mut = useMutation({
    mutationFn: () => {
      const payload = {}
      for (const k of Object.keys(form)) payload[k] = form[k] || null
      return api.put(`/admin/academic-years/${year.id}/`, payload).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fees-academic-years'] })
      toast.success('Quarter dates updated.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save.'),
  })

  function handleSave() {
    for (const q of QUARTERS) {
      const s = form[`${q.key}_start`], e = form[`${q.key}_end`]
      if (s && e && s > e) { toast.error(`${q.label}: start must be before end.`); return }
    }
    mut.mutate()
  }

  return (
    <Modal isOpen title={`Edit Quarters — ${year.year}`} onClose={onClose} size="lg">
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {QUARTERS.map(q => (
            <div key={q.key} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-semibold text-gray-800">{q.label}</span>
                  <span className="ml-2 text-xs text-gray-400">{q.term}</span>
                </div>
                <span className="text-xs text-gray-400">{q.hint}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Start</label>
                  <input type="date" value={form[`${q.key}_start`]}
                    onChange={e => set(`${q.key}_start`, e.target.value)}
                    className={dateCls} />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">End</label>
                  <input type="date" value={form[`${q.key}_end`]}
                    onChange={e => set(`${q.key}_end`, e.target.value)}
                    className={dateCls} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={mut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Save Quarters'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Add / Edit event modal ────────────────────────────────────────────────────

const BLANK_EVENT = { title: '', event_type: 'OTHER', start_date: '', end_date: '', description: '' }

function EventModal({ event, yearId, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!event
  const [form, setForm] = useState(
    isEdit
      ? { title: event.title, event_type: event.event_type,
          start_date: event.start_date ?? '',
          end_date:   event.end_date   ?? '',
          description: event.description }
      : { ...BLANK_EVENT }
  )
  const set = (k, v) => setForm(f => ({ ...f, [k]: normalizeDate(v) }))

  const mut = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        end_date: form.end_date || null,   // never send empty string
      }
      return isEdit
        ? updateCalendarEvent(event.id, payload)
        : createCalendarEvent({ ...payload, academic_year: yearId })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['school-calendar-events', yearId] })
      toast.success(isEdit ? 'Event updated.' : 'Event added.')
      onClose()
    },
    onError: (err) => {
      const d = err.response?.data
      if (d?.end_date)   { toast.error(d.end_date[0]);   return }
      if (d?.start_date) { toast.error(d.start_date[0]); return }
      toast.error(d?.detail ?? 'Failed.')
    },
  })

  function handleSave() {
    if (!form.title.trim()) { toast.error('Title is required.'); return }
    if (!form.start_date)   { toast.error('Start date is required.'); return }
    if (form.end_date && form.end_date < form.start_date) {
      toast.error('End date cannot be before start date.'); return
    }
    mut.mutate()
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30'

  return (
    <Modal isOpen title={isEdit ? 'Edit Event' : 'Add Event'} onClose={onClose} size="md">
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="e.g. Sports Day, Mid-term break…" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Event Type</label>
          <select className={inputCls} value={form.event_type} onChange={e => set('event_type', e.target.value)}>
            {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Start Date <span className="text-red-500">*</span></label>
            <input type="date" className={inputCls} value={form.start_date}
              onChange={e => set('start_date', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">End Date <span className="text-gray-400">(optional)</span></label>
            <input type="date" className={inputCls} value={form.end_date}
              onChange={e => set('end_date', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <textarea rows={3} className={inputCls + ' resize-none'} value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Optional details…" />
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={mut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {mut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Event'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Delete confirm ────────────────────────────────────────────────────────────

function DeleteEventModal({ event, yearId, onClose }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => deleteCalendarEvent(event.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['school-calendar-events', yearId] })
      toast.success('Event deleted.')
      onClose()
    },
    onError: () => toast.error('Failed to delete.'),
  })
  return (
    <Modal isOpen title="Delete Event" onClose={onClose} size="sm">
      <div className="p-6 space-y-4">
        <p className="text-sm text-gray-600">
          Delete <strong>{event.title}</strong>? This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="flex-1 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50">
            {mut.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Events list ───────────────────────────────────────────────────────────────

function groupByMonth(events) {
  const groups = {}
  for (const ev of events) {
    const key = ev.start_date.slice(0, 7) // YYYY-MM
    if (!groups[key]) groups[key] = []
    groups[key].push(ev)
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
}

function monthLabel(ym) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-TZ', { month: 'long', year: 'numeric' })
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SchoolCalendarPage() {
  const { user } = useAuth()
  const canManage = CALENDAR_MANAGERS.includes(user?.role)

  const [selectedYearId, setSelectedYearId] = useState(null)
  const [editQuartersFor, setEditQuartersFor] = useState(null)
  const [addEvent, setAddEvent]               = useState(false)
  const [editEvent, setEditEvent]             = useState(null)
  const [deleteEvent, setDeleteEvent]         = useState(null)
  const [pdfLoading, setPdfLoading]           = useState(false)

  const { data: years = [], isLoading: yearsLoading } = useQuery({
    queryKey: ['fees-academic-years'],
    queryFn: () => api.get('/fees/academic-years/').then(r =>
      Array.isArray(r.data) ? r.data : (r.data.results ?? [])
    ),
  })

  const currentYear = years.find(y => y.is_current) ?? years[0] ?? null
  const activeYearId = selectedYearId ?? currentYear?.id ?? null
  const activeYear   = years.find(y => y.id === activeYearId) ?? null

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['school-calendar-events', activeYearId],
    queryFn: () => getCalendarEvents(activeYearId),
    enabled: !!activeYearId,
  })

  const grouped = groupByMonth(events)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          School events and quarter dates for the academic year.
        </p>
        <div className="flex items-center gap-2">
          {/* Year selector */}
          <div className="relative">
            <select
              value={activeYearId ?? ''}
              onChange={e => setSelectedYearId(Number(e.target.value))}
              className="appearance-none pr-8 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {yearsLoading
                ? <option>Loading…</option>
                : years.map(y => (
                    <option key={y.id} value={y.id}>
                      {y.year}{y.is_current ? ' (current)' : ''}
                    </option>
                  ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {activeYearId && (
            <button
              onClick={async () => {
                if (!activeYear) return
                setPdfLoading(true)
                try {
                  await downloadCalendarPDF(activeYear, events, grouped)
                } catch {
                  toast.error('Failed to generate PDF.')
                } finally {
                  setPdfLoading(false)
                }
              }}
              disabled={pdfLoading}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              <Download size={14} />
              {pdfLoading ? 'Generating…' : 'Download PDF'}
            </button>
          )}

          {canManage && (
            <button
              onClick={() => setAddEvent(true)}
              disabled={!activeYearId}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              <Plus size={14} /> Add Event
            </button>
          )}
        </div>
      </div>

      {/* Terms & Quarters */}
      {activeYear && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800">Terms &amp; Quarters — {activeYear.year}</h3>
            {canManage && (
              <button
                onClick={() => setEditQuartersFor(activeYear)}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Pencil size={12} /> Edit
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {QUARTERS.map(q => (
              <div key={q.key} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-6 h-5 bg-primary/10 text-primary text-[10px] font-bold rounded flex items-center justify-center">
                    {q.label}
                  </span>
                  <span className="text-[10px] text-gray-400">{q.term}</span>
                </div>
                <p className="text-xs text-gray-700 font-medium">
                  {fmtRange(activeYear[`${q.key}_start`], activeYear[`${q.key}_end`])}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Events */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h3 className="text-sm font-semibold text-gray-800">
            School Events{activeYear ? ` — ${activeYear.year}` : ''}
          </h3>
        </div>

        {eventsLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse h-14 bg-gray-50 rounded-lg" />
            ))}
          </div>
        ) : !activeYearId ? (
          <div className="p-10 text-center text-sm text-gray-400">
            <CalendarDays size={32} className="mx-auto text-gray-200 mb-2" />
            No academic year selected.
          </div>
        ) : events.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">
            <CalendarDays size={32} className="mx-auto text-gray-200 mb-2" />
            No events scheduled for {activeYear?.year}.
            {canManage && <span> Click <strong>Add Event</strong> to get started.</span>}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {grouped.map(([ym, evs]) => (
              <div key={ym}>
                <div className="px-5 py-2 bg-gray-50/60">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {monthLabel(ym)}
                  </span>
                </div>
                <ul className="divide-y divide-gray-50">
                  {evs.map(ev => (
                    <li key={ev.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="shrink-0 w-10 text-center pt-0.5">
                        <div className="text-lg font-bold text-gray-800 leading-none">
                          {new Date(ev.start_date + 'T00:00:00').getDate()}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {new Date(ev.start_date + 'T00:00:00').toLocaleDateString('en-TZ', { weekday: 'short' })}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">{ev.title}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${eventTypeColor(ev.event_type)}`}>
                            {eventTypeLabel(ev.event_type)}
                          </span>
                        </div>
                        {ev.end_date && ev.end_date !== ev.start_date && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Until {fmtDate(ev.end_date)}
                          </p>
                        )}
                        {ev.description && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{ev.description}</p>
                        )}
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setEditEvent(ev)}
                            className="p-1.5 text-gray-400 hover:text-primary rounded transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => setDeleteEvent(ev)}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {editQuartersFor && (
        <EditQuartersModal year={editQuartersFor} onClose={() => setEditQuartersFor(null)} />
      )}
      {addEvent && (
        <EventModal yearId={activeYearId} onClose={() => setAddEvent(false)} />
      )}
      {editEvent && (
        <EventModal event={editEvent} yearId={activeYearId} onClose={() => setEditEvent(null)} />
      )}
      {deleteEvent && (
        <DeleteEventModal event={deleteEvent} yearId={activeYearId} onClose={() => setDeleteEvent(null)} />
      )}
    </div>
  )
}
