import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  GraduationCap,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  Send,
  Smartphone,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  broadcast,
  getHistory,
  sendAbsenceAlerts,
  sendBulkFeeReminders,
} from '../../api/communications'
import { getStudents } from '../../api/students'
import Skeleton from '../../components/ui/Skeleton'
import { LEVEL_OPTIONS } from '../../lib/constants'

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNELS = [
  { value: 'WHATSAPP', label: 'WhatsApp', Icon: MessageCircle, enabled: true },
  { value: 'EMAIL',    label: 'Email',    Icon: Mail,           enabled: true },
  { value: 'SMS',      label: 'SMS',      Icon: Smartphone,     enabled: false,
    badge: "Africa's Talking — coming soon" },
]

const AUDIENCE_OPTIONS = [
  { value: 'SCHOOL',     label: 'Whole School', desc: 'All active students & parents', Icon: Users },
  { value: 'LEVEL',      label: 'By Level',     desc: 'e.g. all Form 2 parents',       Icon: GraduationCap },
  { value: 'CLASS',      label: 'By Class',     desc: 'Level + specific stream',        Icon: Users },
  { value: 'INDIVIDUAL', label: 'Individual',   desc: 'One specific student',           Icon: User },
]

const CHANNEL_BADGE = {
  WHATSAPP: 'bg-green-100 text-green-700',
  EMAIL:    'bg-blue-100 text-blue-700',
  SMS:      'bg-purple-100 text-purple-700',
}

const AUDIENCE_LABEL = {
  SCHOOL:     'Whole School',
  LEVEL:      'By Level',
  CLASS:      'By Class',
  INDIVIDUAL: 'Individual',
}

// ── Student search ────────────────────────────────────────────────────────────

function StudentSearchInput({ selectedName, onSelect, onClear }) {
  const [query, setQuery]   = useState('')
  const [open,  setOpen]    = useState(false)
  const wrapRef             = useRef(null)
  const timerRef            = useRef(null)

  const { data } = useQuery({
    queryKey: ['comm-student-search', query],
    queryFn:  () => getStudents({ search: query, status: 'ACTIVE' }),
    enabled:  query.length >= 2,
    staleTime: 30000,
  })
  const students = data?.results ?? data ?? []

  const handleType = useCallback((e) => {
    const v = e.target.value
    setQuery(v)
    clearTimeout(timerRef.current)
    if (v.length >= 2) timerRef.current = setTimeout(() => setOpen(true), 300)
    else setOpen(false)
  }, [])

  useEffect(() => {
    function outside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  if (selectedName) {
    return (
      <div className="flex items-center gap-2 border-2 border-primary rounded-lg px-3 py-2 bg-primary/5">
        <User size={14} className="text-primary shrink-0" />
        <span className="text-sm flex-1 text-gray-800">{selectedName}</span>
        <button onClick={onClear} className="p-0.5 text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={query}
        onChange={handleType}
        placeholder="Search by name or student ID…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
          focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
      {open && students.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border
          border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {students.map((s) => (
            <button
              key={s.id}
              onClick={() => { onSelect(s); setQuery(''); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm transition-colors"
            >
              <span className="font-medium text-gray-900">{s.full_name}</span>
              <span className="text-xs text-gray-400 ml-2 font-mono">{s.student_id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Previews ──────────────────────────────────────────────────────────────────

function WhatsAppPreview({ body }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <MessageCircle size={12} className="text-green-600" />
        WhatsApp Preview
      </p>
      <div className="bg-[#e5ddd5] rounded-xl p-4">
        <div className="bg-white rounded-2xl rounded-tl-none px-4 py-3 max-w-[85%] shadow-sm">
          <p className="text-sm text-gray-900 whitespace-pre-wrap break-words leading-relaxed">
            {body}
          </p>
          <div className="flex items-center justify-end gap-1 mt-2">
            <Clock size={10} className="text-gray-400" />
            <span className="text-[10px] text-gray-400">
              {new Date().toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <Check size={10} className="text-blue-500" />
            <Check size={10} className="text-blue-500 -ml-1.5" />
          </div>
        </div>
      </div>
    </div>
  )
}

function EmailPreview({ subject, body }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Mail size={12} className="text-blue-500" />
        Email Preview
      </p>
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 space-y-1">
          <p className="text-xs text-gray-500">
            From: <span className="text-gray-700">Shule SMS &lt;no-reply@shule.ac.tz&gt;</span>
          </p>
          <p className="text-xs text-gray-500">
            Subject: <span className="text-gray-700 font-medium">{subject || '(no subject)'}</span>
          </p>
        </div>
        <div className="px-4 py-4 bg-white">
          <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
            {body || '(empty)'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Quick action button ───────────────────────────────────────────────────────

function QuickActionBtn({ label, desc, Icon, loading, onClick, variant }) {
  const variants = {
    amber: {
      wrap: 'bg-amber-50 border-amber-200',
      icon: 'bg-amber-100 text-amber-600',
      btn:  'bg-amber-500 hover:bg-amber-600 text-white',
    },
    red: {
      wrap: 'bg-red-50 border-red-200',
      icon: 'bg-red-100 text-red-500',
      btn:  'bg-red-500 hover:bg-red-600 text-white',
    },
  }
  const v = variants[variant] ?? variants.amber
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${v.wrap}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${v.icon}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-800">{label}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{desc}</p>
        <button
          onClick={onClick}
          disabled={loading}
          className={`mt-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
            font-medium transition-colors disabled:opacity-60 ${v.btn}`}
        >
          {loading
            ? <><Loader2 size={11} className="animate-spin" /> Sending…</>
            : <><Send size={11} /> Send Now</>}
        </button>
      </div>
    </div>
  )
}

// ── Compose tab ───────────────────────────────────────────────────────────────

const selectCls = `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`
const inputCls = `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

function ComposeTab() {
  const queryClient = useQueryClient()

  const [channel,           setChannel]           = useState('WHATSAPP')
  const [audience,          setAudience]          = useState('SCHOOL')
  const [targetLevel,       setTargetLevel]       = useState('')
  const [targetStream,      setTargetStream]      = useState('')
  const [targetStudentId,   setTargetStudentId]   = useState(null)
  const [targetStudentName, setTargetStudentName] = useState('')
  const [subject,           setSubject]           = useState('')
  const [body,              setBody]              = useState('')
  const [sending,           setSending]           = useState(false)
  const [waUrls,            setWaUrls]            = useState([])
  const [quickLoading,      setQuickLoading]      = useState({ absentees: false, defaulters: false })

  // ── Recipient count ──────────────────────────────────────────────────────────
  const countEnabled = audience === 'SCHOOL'
    || (audience === 'LEVEL' && !!targetLevel)
    || (audience === 'CLASS' && !!targetLevel)

  const { data: countData } = useQuery({
    queryKey: ['comm-recipient-count', audience, targetLevel, targetStream],
    queryFn: () => {
      const p = { status: 'ACTIVE' }
      if (audience !== 'SCHOOL' && targetLevel) p.level = targetLevel
      if (audience === 'CLASS' && targetStream)  p.stream = targetStream
      return getStudents(p)
    },
    enabled: countEnabled,
    staleTime: 60000,
  })

  const recipientCount = audience === 'INDIVIDUAL'
    ? (targetStudentId ? 1 : 0)
    : countData
      ? (countData.count ?? countData.length ?? '…')
      : countEnabled ? '…' : null

  // ── Validation ───────────────────────────────────────────────────────────────
  const bodyLen   = body.length
  const overLimit = channel === 'WHATSAPP' && bodyLen > 1000
  const canSend   = !sending && !overLimit && body.trim().length > 0
    && (audience !== 'LEVEL'      || !!targetLevel)
    && (audience !== 'CLASS'      || !!targetLevel)
    && (audience !== 'INDIVIDUAL' || !!targetStudentId)

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handleSend() {
    const payload = { message_type: channel, audience, body: body.trim() }
    if (channel === 'EMAIL') payload.subject = subject
    if (audience === 'LEVEL' || audience === 'CLASS') payload.target_level = targetLevel
    if (audience === 'CLASS' && targetStream) payload.target_stream = targetStream
    if (audience === 'INDIVIDUAL') payload.target_student = targetStudentId

    setSending(true)
    try {
      const result = await broadcast(payload)
      const n = result.total_recipients
      toast.success(`Message queued for ${n} recipient${n !== 1 ? 's' : ''}.`)
      setWaUrls(result.wa_urls ?? [])
      setBody('')
      setSubject('')
      queryClient.invalidateQueries({ queryKey: ['msg-history'] })
    } catch (err) {
      const d = err.response?.data
      const msg = d?.detail ?? Object.values(d ?? {})?.[0] ?? 'Send failed.'
      toast.error(typeof msg === 'string' ? msg : 'Send failed.')
    } finally {
      setSending(false)
    }
  }

  async function handleAbsenteeAlerts() {
    setQuickLoading((p) => ({ ...p, absentees: true }))
    try {
      const r = await sendAbsenceAlerts()
      const urls = r.wa_urls ?? []
      if (r.sent === 0 && urls.length === 0) {
        toast('No unsent absence alerts for today.')
      } else {
        toast.success(`${r.sent || urls.length} absence alert${(r.sent || urls.length) !== 1 ? 's' : ''} sent.`)
      }
      if (urls.length) setWaUrls(urls)
      queryClient.invalidateQueries({ queryKey: ['msg-history'] })
    } catch {
      toast.error('Could not send absence alerts.')
    } finally {
      setQuickLoading((p) => ({ ...p, absentees: false }))
    }
  }

  async function handleFeeReminders() {
    setQuickLoading((p) => ({ ...p, defaulters: true }))
    try {
      const r = await sendBulkFeeReminders()
      if (r.total_students === 0) {
        toast('No fee defaulters found.')
      } else {
        toast.success(`${r.sent} reminder${r.sent !== 1 ? 's' : ''} sent to ${r.total_students} defaulter${r.total_students !== 1 ? 's' : ''}.`)
      }
      queryClient.invalidateQueries({ queryKey: ['msg-history'] })
    } catch {
      toast.error('Could not send fee reminders.')
    } finally {
      setQuickLoading((p) => ({ ...p, defaulters: false }))
    }
  }

  function resetAudience() {
    setTargetLevel('')
    setTargetStream('')
    setTargetStudentId(null)
    setTargetStudentName('')
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* 1 · Channel */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Channel</h2>
        <div className="grid grid-cols-3 gap-3">
          {CHANNELS.map(({ value, label, Icon, enabled, badge }) => (
            <button
              key={value}
              disabled={!enabled}
              onClick={() => enabled && setChannel(value)}
              className={`relative flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-xl
                border-2 text-sm font-medium transition-all
                ${!enabled
                  ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                  : channel === value
                    ? 'border-primary bg-primary/5 text-primary shadow-sm'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-primary/40'}`}
            >
              <Icon size={20} />
              {label}
              {badge && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px]
                  bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 2 · Audience */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Audience</h2>
          {recipientCount !== null && (
            <span className="text-xs text-gray-500">
              ~<span className="font-semibold text-gray-800 tabular-nums">{recipientCount}</span>
              {' '}recipient{recipientCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {AUDIENCE_OPTIONS.map(({ value, label, desc, Icon }) => (
            <button
              key={value}
              onClick={() => { setAudience(value); resetAudience() }}
              className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all
                ${audience === value
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 hover:border-primary/30'}`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5
                ${audience === value ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'}`}>
                <Icon size={13} />
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-semibold leading-none mb-0.5
                  ${audience === value ? 'text-primary' : 'text-gray-700'}`}>
                  {label}
                </p>
                <p className="text-[11px] text-gray-400 leading-snug">{desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Sub-inputs for LEVEL / CLASS */}
        {(audience === 'LEVEL' || audience === 'CLASS') && (
          <div className="space-y-2 pt-1">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Level <span className="text-danger">*</span></label>
              <select value={targetLevel} onChange={(e) => setTargetLevel(e.target.value)} className={selectCls}>
                <option value="">Select level…</option>
                {LEVEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {audience === 'CLASS' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Stream (optional)</label>
                <input
                  value={targetStream}
                  onChange={(e) => setTargetStream(e.target.value)}
                  placeholder="e.g. A"
                  className={inputCls}
                />
              </div>
            )}
          </div>
        )}

        {/* Sub-input for INDIVIDUAL */}
        {audience === 'INDIVIDUAL' && (
          <div className="pt-1">
            <label className="block text-xs text-gray-500 mb-1">Student <span className="text-danger">*</span></label>
            <StudentSearchInput
              selectedName={targetStudentName}
              onSelect={(s) => {
                setTargetStudentId(s.id)
                setTargetStudentName(`${s.full_name} · ${s.student_id}`)
              }}
              onClear={() => { setTargetStudentId(null); setTargetStudentName('') }}
            />
          </div>
        )}
      </div>

      {/* 3 · Subject (email only) */}
      {channel === 'EMAIL' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. End of Term 2 Results Available"
            className={inputCls}
          />
        </div>
      )}

      {/* 4 · Message body */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-700">Message</label>
          {channel === 'WHATSAPP' && (
            <span className={`text-xs tabular-nums font-medium
              ${overLimit ? 'text-red-500' : bodyLen > 800 ? 'text-yellow-600' : 'text-gray-400'}`}>
              {bodyLen} / 1000
            </span>
          )}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder={
            channel === 'WHATSAPP'
              ? 'Habari wazazi, tunataka kuwajulisha…'
              : 'Dear Parent / Guardian,\n\n'
          }
          className={`w-full border rounded-lg px-3 py-2.5 text-sm resize-none
            focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
            ${overLimit ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
        />
        {overLimit && (
          <p className="text-xs text-red-500">WhatsApp messages must be 1,000 characters or fewer.</p>
        )}
      </div>

      {/* 5 · Preview */}
      {body.trim() && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          {channel === 'WHATSAPP' && <WhatsAppPreview body={body} />}
          {channel === 'EMAIL'    && <EmailPreview subject={subject} body={body} />}
        </div>
      )}

      {/* 6 · Send */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="flex items-center gap-2 px-7 py-2.5 bg-primary text-white rounded-xl
            text-sm font-medium hover:bg-secondary disabled:opacity-50 transition-colors shadow-sm"
        >
          {sending
            ? <><Loader2 size={15} className="animate-spin" /> Sending…</>
            : <><Send size={15} /> Send Message</>}
        </button>
        {recipientCount !== null && !sending && (
          <span className="text-sm text-gray-400">
            to <span className="font-semibold text-gray-600 tabular-nums">{recipientCount}</span> recipients
          </span>
        )}
      </div>

      {/* 7 · WA URLs panel */}
      {waUrls.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle size={15} className="text-green-600" />
              <p className="text-sm font-semibold text-green-800">
                {waUrls.length} WhatsApp message{waUrls.length !== 1 ? 's' : ''} ready
              </p>
            </div>
            <button onClick={() => setWaUrls([])} className="p-1 text-green-500 hover:text-green-700">
              <X size={15} />
            </button>
          </div>
          <p className="text-xs text-green-700">
            Click each link to open WhatsApp with the pre-filled message.
          </p>
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {waUrls.map((item, i) => {
              const href  = typeof item === 'string' ? item : (item.url ?? item)
              const label = typeof item === 'string' ? `Recipient ${i + 1}` : (item.student_name ?? item.student ?? `Recipient ${i + 1}`)
              return (
                <a
                  key={i}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-3 py-2 bg-white border border-green-200
                    rounded-lg text-xs text-green-700 hover:bg-green-100 transition-colors"
                >
                  <MessageCircle size={12} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* 8 · Quick actions */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Zap size={15} className="text-accent shrink-0" />
          <h2 className="text-sm font-semibold text-gray-700">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <QuickActionBtn
            label="Alert Today's Absentees"
            desc="Notify parents of all students absent today"
            Icon={Bell}
            loading={quickLoading.absentees}
            onClick={handleAbsenteeAlerts}
            variant="amber"
          />
          <QuickActionBtn
            label="Remind Fee Defaulters"
            desc="Send fee reminders to all families with outstanding balances"
            Icon={AlertTriangle}
            loading={quickLoading.defaulters}
            onClick={handleFeeReminders}
            variant="red"
          />
        </div>
      </div>

    </div>
  )
}

// ── History tab ───────────────────────────────────────────────────────────────

function MessageRow({ msg, expanded, onToggle }) {
  const preview  = msg.subject || (msg.body?.slice(0, 70) + (msg.body?.length > 70 ? '…' : ''))
  const sentDate = new Date(msg.sent_at)
  const rate     = msg.total_recipients > 0
    ? Math.round((msg.delivered_count / msg.total_recipients) * 100)
    : null

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors text-left"
      >
        {/* Date */}
        <div className="text-xs text-gray-400 tabular-nums w-[68px] shrink-0">
          <div className="font-medium">
            {sentDate.toLocaleDateString('en-TZ', { day: 'numeric', month: 'short' })}
          </div>
          <div className="text-[10px]">
            {sentDate.toLocaleTimeString('en-TZ', { timeStyle: 'short' })}
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{preview}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium
              ${CHANNEL_BADGE[msg.message_type] ?? 'bg-gray-100 text-gray-600'}`}>
              {msg.message_type}
            </span>
            <span className="text-[10px] text-gray-400">
              {AUDIENCE_LABEL[msg.audience] ?? msg.audience}
              {msg.target_level ? ` · ${msg.target_level}` : ''}
            </span>
            {msg.sent_by_name && (
              <span className="text-[10px] text-gray-400">by {msg.sent_by_name}</span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="text-right text-xs shrink-0 hidden sm:block">
          <p className="font-medium text-gray-700 tabular-nums">{msg.total_recipients} sent</p>
          {rate !== null && (
            <p className={`text-[11px] tabular-nums
              ${rate >= 80 ? 'text-green-600' : rate >= 50 ? 'text-yellow-600' : 'text-gray-400'}`}>
              {rate}% delivered
            </p>
          )}
        </div>

        <div className="text-gray-300 shrink-0">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100 bg-gray-50/40 space-y-4">
          {/* Full message */}
          <div className="pt-4">
            {msg.subject && (
              <p className="text-xs text-gray-400 mb-1">
                Subject: <span className="font-semibold text-gray-700">{msg.subject}</span>
              </p>
            )}
            <div className="bg-white rounded-lg border border-gray-100 px-4 py-3">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{msg.body}</p>
            </div>
          </div>

          {/* Meta */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
            <span>Sent by <strong className="text-gray-700">{msg.sent_by_name ?? 'System'}</strong></span>
            <span className="tabular-nums">
              {msg.total_recipients} recipients · {msg.delivered_count} delivered
            </span>
            <span>{new Date(msg.sent_at).toLocaleString('en-TZ')}</span>
          </div>

          {/* Delivery log */}
          {msg.logs?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Delivery Log ({msg.logs.length})
              </p>
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">Recipient</th>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium hidden sm:table-cell">Contact</th>
                        <th className="px-3 py-2 text-center text-gray-500 font-medium w-20">Status</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium hidden md:table-cell w-20">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {msg.logs.slice(0, 25).map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50/50">
                          <td className="px-3 py-2 font-medium text-gray-800">{log.recipient_name}</td>
                          <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">
                            {log.whatsapp_url
                              ? <a href={log.whatsapp_url} target="_blank" rel="noopener noreferrer"
                                  className="text-green-600 hover:underline">Open WA</a>
                              : log.recipient_phone || log.recipient_email || '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded-full font-medium
                              ${log.status === 'SENT'
                                ? 'bg-green-100 text-green-700'
                                : log.status === 'FAILED'
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-gray-100 text-gray-500'}`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-400 hidden md:table-cell">
                            {log.sent_at
                              ? new Date(log.sent_at).toLocaleTimeString('en-TZ', { timeStyle: 'short' })
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {msg.logs.length > 25 && (
                  <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 text-center">
                    Showing 25 of {msg.logs.length} log entries
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function HistoryTab() {
  const [channelFilter, setChannelFilter] = useState('')
  const [dateFrom,      setDateFrom]      = useState('')
  const [dateTo,        setDateTo]        = useState('')
  const [expanded,      setExpanded]      = useState(null)

  const { data: histData, isLoading, isError, refetch } = useQuery({
    queryKey: ['msg-history', channelFilter, dateFrom, dateTo],
    queryFn:  () => getHistory({
      channel:   channelFilter || undefined,
      date_from: dateFrom      || undefined,
      date_to:   dateTo        || undefined,
    }),
    staleTime: 30000,
  })
  const messages = histData?.results ?? histData ?? []

  const filterCls = `border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white
    focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Channel</label>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className={filterCls}
            >
              <option value="">All Channels</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={filterCls}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={filterCls}
            />
          </div>
          <button
            onClick={() => { setChannelFilter(''); setDateFrom(''); setDateTo('') }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-500
              hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
          <button
            onClick={() => refetch()}
            className="p-2 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Message list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : isError ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-sm text-danger">Failed to load history.</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <MessageSquare size={36} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">No messages sent yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {messages.map((msg) => (
              <MessageRow
                key={msg.id}
                msg={msg}
                expanded={expanded === msg.id}
                onToggle={() => setExpanded((p) => (p === msg.id ? null : msg.id))}
              />
            ))}
          </div>
          {histData?.count > messages.length && (
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 text-center">
              Showing {messages.length} of {histData.count} messages
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CommunicationsPage() {
  const [activeTab, setActiveTab] = useState('compose')

  const TABS = [
    { key: 'compose', label: 'Compose', Icon: Send },
    { key: 'history', label: 'History', Icon: Clock },
  ]

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium
              transition-all
              ${activeTab === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'compose' && <ComposeTab />}
      {activeTab === 'history' && <HistoryTab />}
    </div>
  )
}
