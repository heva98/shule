import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  AlertTriangle, ChevronLeft, Clock, GraduationCap, Loader2, MessageSquare,
  RefreshCw, Send, Settings, Users, Wallet,
} from 'lucide-react'
import {
  getSendableExams, getSmsBatch, getSmsBatches, getSmsConfig, getSmsTemplates,
  previewSms, resendFailed, sendSms, updateSmsConfig, updateSmsTemplate,
} from '../../api/sms'
import { useAuth } from '../../context/AuthContext'
import { useSchoolLevels } from '../../hooks/useSchoolLevels'
import Skeleton from '../../components/ui/Skeleton'

const KINDS = [
  { value: 'EXAM_RESULTS', label: 'Exam results', Icon: GraduationCap,
    roles: ['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER', 'CLASS_TEACHER'], allowKey: 'allow_exam_results' },
  { value: 'FEE_REMINDER', label: 'Fee reminders', Icon: Wallet,
    roles: ['OWNER', 'HEADTEACHER', 'BURSAR'], allowKey: 'allow_fee_reminders' },
  { value: 'ANNOUNCEMENT', label: 'Announcement', Icon: Users,
    roles: ['OWNER', 'HEADTEACHER', 'BURSAR'], allowKey: 'allow_announcements' },
]

const STATUS_BADGE = {
  PENDING: 'bg-gray-100 text-gray-600', QUEUED: 'bg-blue-100 text-blue-700',
  RUNNING: 'bg-blue-100 text-blue-700', COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700', CANCELLED: 'bg-gray-100 text-gray-500',
  SENT: 'bg-green-100 text-green-700', DELIVERED: 'bg-green-100 text-green-700',
  SKIPPED: 'bg-yellow-100 text-yellow-700',
}

const money = (v) => (Number(v) ? `TZS ${Number(v).toLocaleString()}` : '—')

// ── Compose ───────────────────────────────────────────────────────────────

function ComposeTab({ config }) {
  const { levelOptions } = useSchoolLevels()
  const qc = useQueryClient()
  const role = config.role

  const kinds = KINDS.filter(
    (k) => k.roles.includes(role) && config[k.allowKey] &&
      (k.value !== 'FEE_REMINDER' || config.fees_module_enabled),
  )
  const [kind, setKind] = useState(kinds[0]?.value ?? '')
  const [language, setLanguage] = useState(config.language || 'SW')
  const [form, setForm] = useState({ exam_id: '', scope: 'all', audience: 'SCHOOL', level: '', stream: '', message: '' })
  const [preview, setPreview] = useState(null)
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setPreview(null) }

  const exams = useQuery({
    queryKey: ['sms-exams'], queryFn: getSendableExams, enabled: kind === 'EXAM_RESULTS',
  })

  const payload = useMemo(() => {
    if (kind === 'EXAM_RESULTS') return { kind, language, exam_id: form.exam_id }
    if (kind === 'FEE_REMINDER') return { kind, language, scope: form.scope, level: form.level, stream: form.stream }
    return { kind, language, audience: form.audience, level: form.level, stream: form.stream, message: form.message }
  }, [kind, language, form])

  const previewMut = useMutation({
    mutationFn: () => previewSms(payload),
    onSuccess: setPreview,
    onError: (e) => toast.error(e.response?.data?.detail || 'Could not build the recipient list.'),
  })
  const sendMut = useMutation({
    mutationFn: (dry_run) => sendSms({ ...payload, dry_run }),
    onSuccess: (batch, dry_run) => {
      qc.invalidateQueries({ queryKey: ['sms-batches'] })
      setPreview(null)
      toast.success(dry_run
        ? `Dry run saved — ${batch.total_recipients} resolved, nothing sent.`
        : `Queued: ${batch.total_recipients - batch.skipped_count} message(s).`)
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Send failed.'),
  })

  if (!kinds.length) {
    return <p className="text-sm text-gray-500">No SMS types are enabled for your role.</p>
  }

  const canPreview =
    (kind === 'EXAM_RESULTS' && form.exam_id) ||
    kind === 'FEE_REMINDER' ||
    (kind === 'ANNOUNCEMENT' && form.message.trim() &&
      (form.audience === 'SCHOOL' || form.level) &&
      (form.audience !== 'CLASS' || form.stream))

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="flex gap-2 flex-wrap">
          {kinds.map(({ value, label, Icon }) => (
            <button key={value} onClick={() => { setKind(value); setPreview(null) }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition
                ${kind === value ? 'border-primary bg-primary/5 text-primary font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Language</span>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {[['SW', 'Swahili'], ['EN', 'English']].map(([val, lbl]) => (
              <button key={val} type="button"
                onClick={() => { setLanguage(val); setPreview(null) }}
                className={`px-3 py-1 rounded-md text-sm transition
                  ${language === val ? 'bg-white text-gray-900 shadow-sm font-medium'
                    : 'text-gray-500 hover:text-gray-700'}`}>
                {lbl}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">
            {language === config.language ? 'school default' : 'overrides the school default'}
          </span>
        </div>

        {kind === 'EXAM_RESULTS' && (
          <label className="block text-sm">
            <span className="text-gray-600">Exam (your class)</span>
            <select value={form.exam_id} onChange={(e) => set({ exam_id: e.target.value })}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Select an exam…</option>
              {(exams.data ?? []).map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} — {ex.level}{ex.stream} · {ex.academic_year}
                </option>
              ))}
            </select>
            {exams.isLoading && <span className="text-xs text-gray-400">Loading exams…</span>}
            {exams.data?.length === 0 && (
              <span className="text-xs text-amber-600">No exams found for your class.</span>
            )}
          </label>
        )}

        {kind === 'FEE_REMINDER' && (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-gray-600">Who</span>
              <select value={form.scope} onChange={(e) => set({ scope: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="all">Everyone with a balance</option>
                <option value="overdue">Overdue only</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-gray-600">Level (optional)</span>
                <select value={form.level} onChange={(e) => set({ level: e.target.value })}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">All levels</option>
                  {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Stream (optional)</span>
                <input value={form.stream} onChange={(e) => set({ stream: e.target.value })}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. A" />
              </label>
            </div>
            <p className="text-xs text-gray-400">
              Each pupil’s primary contact gets one message; the overdue wording is used automatically
              once a balance is past its due date.
            </p>
          </div>
        )}

        {kind === 'ANNOUNCEMENT' && (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-gray-600">Audience</span>
              <select value={form.audience} onChange={(e) => set({ audience: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="SCHOOL">Whole school</option>
                <option value="LEVEL">By level</option>
                <option value="CLASS">By class (level + stream)</option>
              </select>
            </label>
            {form.audience !== 'SCHOOL' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-gray-600">Level</span>
                  <select value={form.level} onChange={(e) => set({ level: e.target.value })}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select…</option>
                    {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                {form.audience === 'CLASS' && (
                  <label className="block text-sm">
                    <span className="text-gray-600">Stream</span>
                    <input value={form.stream} onChange={(e) => set({ stream: e.target.value })}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. A" />
                  </label>
                )}
              </div>
            )}
            <label className="block text-sm">
              <span className="text-gray-600">Message</span>
              <textarea value={form.message} onChange={(e) => set({ message: e.target.value })}
                rows={4} maxLength={400}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. School closes on 20 Dec and reopens on 12 Jan 2027." />
              <span className="text-xs text-gray-400">{form.message.length}/400 · school name is added automatically</span>
            </label>
          </div>
        )}

        <button onClick={() => previewMut.mutate()} disabled={!canPreview || previewMut.isPending}
          className="w-full flex items-center justify-center gap-2 border border-primary text-primary
            rounded-lg py-2 text-sm font-medium hover:bg-primary/5 disabled:opacity-40">
          {previewMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />}
          Preview recipients
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        {!preview ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-10">
            <MessageSquare size={28} className="mb-2" />
            <p className="text-sm">Build a preview to see the recipient count, a sample message,<br />
              segments and the estimated cost before anything is sent.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Will send" value={preview.would_send} tone="green" />
              <Stat label="Skipped" value={preview.skipped} tone={preview.skipped ? 'amber' : 'gray'} />
              <Stat label="Segments" value={preview.total_segments} tone="gray" />
            </div>
            <div className="text-sm text-gray-600">
              Estimated cost:{' '}
              <span className="font-semibold text-gray-800">
                {Number(preview.price_per_segment) ? money(preview.estimated_cost) : `${preview.total_segments} segment(s)`}
              </span>
            </div>

            {!!Object.keys(preview.skip_breakdown || {}).length && (
              <div className="text-xs bg-amber-50 border border-amber-100 rounded-lg p-3 space-y-1">
                {Object.entries(preview.skip_breakdown).map(([reason, n]) => (
                  <div key={reason} className="flex justify-between text-amber-800">
                    <span>{reason}</span><span className="tabular-nums">{n}</span>
                  </div>
                ))}
              </div>
            )}

            {preview.sample?.[0] && (
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
                  Sample — to {preview.sample[0].to_name} · {preview.sample[0].segments} segment(s)
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{preview.sample[0].body}</p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => sendMut.mutate(true)} disabled={sendMut.isPending}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 disabled:opacity-40">
                Save dry run
              </button>
              <button onClick={() => sendMut.mutate(false)}
                disabled={sendMut.isPending || preview.would_send === 0}
                className="flex-1 flex items-center justify-center gap-2 bg-primary text-white rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40">
                {sendMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Send {preview.would_send} SMS
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }) {
  const tones = { green: 'text-green-600', amber: 'text-amber-600', gray: 'text-gray-700' }
  return (
    <div className="border border-gray-100 rounded-lg py-3">
      <div className={`text-xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  )
}

// ── Delivery log ─────────────────────────────────────────────────────────

function LogTab() {
  const qc = useQueryClient()
  const [filters, setFilters] = useState({ kind: '', status: '', date_from: '', date_to: '' })
  const [openId, setOpenId] = useState(null)

  const list = useQuery({
    queryKey: ['sms-batches', filters],
    queryFn: () => getSmsBatches(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))),
  })
  const detail = useQuery({
    queryKey: ['sms-batch', openId], queryFn: () => getSmsBatch(openId), enabled: !!openId,
  })
  const resend = useMutation({
    mutationFn: () => resendFailed(openId),
    onSuccess: (r) => { toast.success(`${r.requeued} message(s) re-queued.`); qc.invalidateQueries({ queryKey: ['sms-batch', openId] }) },
    onError: (e) => toast.error(e.response?.data?.detail || 'Could not resend.'),
  })

  const batches = list.data?.results ?? list.data ?? []

  if (openId) {
    const b = detail.data
    return (
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
          <button onClick={() => setOpenId(null)} className="text-gray-500 hover:text-gray-800">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium">Batch #{openId}</span>
          {b?.failed_count > 0 && !b?.dry_run && (
            <button onClick={() => resend.mutate()} disabled={resend.isPending}
              className="ml-auto flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50">
              <RefreshCw size={12} /> Resend {b.failed_count} failed
            </button>
          )}
        </div>
        {detail.isLoading ? <div className="p-5"><Skeleton className="h-40" /></div> : (
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-4 gap-3 text-center text-sm">
              <Stat label="Recipients" value={b.total_recipients} tone="gray" />
              <Stat label="Sent" value={b.sent_count} tone="green" />
              <Stat label="Failed" value={b.failed_count} tone={b.failed_count ? 'amber' : 'gray'} />
              <Stat label="Skipped" value={b.skipped_count} tone="gray" />
            </div>
            <div className="text-xs text-gray-500">
              {b.kind_display} · {b.language} · {b.total_segments} segments · est. {money(b.total_cost)}
              {b.dry_run && <span className="ml-2 px-1.5 py-0.5 rounded bg-gray-100">DRY RUN</span>}
            </div>
            <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-3 py-2">Pupil</th>
                    <th className="text-left px-3 py-2">Phone</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Reason / provider</th>
                  </tr>
                </thead>
                <tbody>
                  {(b.messages ?? []).map((m) => (
                    <tr key={m.id} className="border-t border-gray-50">
                      <td className="px-3 py-2">{m.student_name || m.recipient_name || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{m.recipient_phone || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded ${STATUS_BADGE[m.status]}`}>{m.status}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {m.skip_reason || m.error_detail || m.provider_status || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <select value={filters.kind} onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
          <option value="">All types</option>
          <option value="EXAM_RESULTS">Exam results</option>
          <option value="FEE_REMINDER">Fee reminders</option>
          <option value="ANNOUNCEMENT">Announcements</option>
          <option value="TERM_DATES">Term dates</option>
          <option value="PAYMENT_RECEIVED">Payment received</option>
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
          <option value="">Any status</option>
          <option value="COMPLETED">Completed</option>
          <option value="RUNNING">Running</option>
          <option value="QUEUED">Queued</option>
          <option value="FAILED">Failed</option>
        </select>
        <input type="date" value={filters.date_from}
          onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        <input type="date" value={filters.date_to}
          onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
      </div>

      {list.isLoading ? <Skeleton className="h-40" /> : batches.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No SMS batches yet.</p>
      ) : (
        <div className="space-y-2">
          {batches.map((b) => (
            <button key={b.id} onClick={() => setOpenId(b.id)}
              className="w-full text-left bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-gray-200 transition">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">{b.kind_display}</span>
                <span className={`text-[11px] px-1.5 py-0.5 rounded ${STATUS_BADGE[b.status]}`}>{b.status}</span>
              </div>
              <div className="mt-1 text-xs text-gray-500 flex gap-3 flex-wrap tabular-nums">
                <span>{new Date(b.created_at).toLocaleString()}</span>
                <span>{b.created_by_name || 'system'}</span>
                <span className="text-green-600">{b.sent_count} sent</span>
                {b.failed_count > 0 && <span className="text-red-600">{b.failed_count} failed</span>}
                {b.skipped_count > 0 && <span className="text-amber-600">{b.skipped_count} skipped</span>}
                {b.dry_run && <span className="px-1 rounded bg-gray-100">dry run</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Settings ────────────────────────────────────────────────────────────

function CfgToggle({ checked, label, onChange }) {
  return (
    <label className="flex items-center justify-between py-2 text-sm">
      <span className="text-gray-700">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function SettingsTab({ config }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState(config)
  const templates = useQuery({ queryKey: ['sms-templates', draft.language], queryFn: () => getSmsTemplates(draft.language) })

  const saveCfg = useMutation({
    mutationFn: (patch) => updateSmsConfig(patch),
    onSuccess: (data) => { setDraft((d) => ({ ...d, ...data })); qc.invalidateQueries({ queryKey: ['sms-config'] }); toast.success('Saved.') },
    onError: () => toast.error('Save failed.'),
  })
  const saveTpl = useMutation({
    mutationFn: ({ id, body }) => updateSmsTemplate(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sms-templates'] }); toast.success('Template saved.') },
    onError: (e) => toast.error(e.response?.data?.body?.[0] || 'Template save failed.'),
  })

  const setFlag = (k) => (value) => {
    setDraft((d) => ({ ...d, [k]: value }))
    saveCfg.mutate({ [k]: value })
  }

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-1">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Behaviour</h3>
        <label className="flex items-center justify-between py-2 text-sm">
          <span className="text-gray-700">Language</span>
          <select value={draft.language}
            onChange={(e) => { setDraft((d) => ({ ...d, language: e.target.value })); saveCfg.mutate({ language: e.target.value }) }}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm">
            <option value="SW">Swahili</option>
            <option value="EN">English</option>
          </select>
        </label>
        <CfgToggle checked={!!draft.allow_exam_results} onChange={setFlag('allow_exam_results')} label="Allow exam-result SMS" />
        <CfgToggle checked={!!draft.allow_fee_reminders} onChange={setFlag('allow_fee_reminders')} label="Allow fee-reminder SMS" />
        <CfgToggle checked={!!draft.allow_announcements} onChange={setFlag('allow_announcements')} label="Allow announcement SMS" />
        <div className="h-px bg-gray-100 my-2" />
        <CfgToggle checked={!!draft.auto_payment_thank_you} onChange={setFlag('auto_payment_thank_you')} label="Auto thank-you when a payment is recorded" />
        <CfgToggle checked={!!draft.auto_term_dates} onChange={setFlag('auto_term_dates')} label="Auto closing/opening reminders (5 & 1 days before)" />
        <p className="text-xs text-gray-400 pt-2">
          Per-batch cap: {draft.effective_recipient_cap} · segment limit: {draft.effective_max_segments}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Templates ({draft.language})</h3>
        {templates.isLoading ? <Skeleton className="h-40" /> : (
          <div className="space-y-4">
            {(templates.data?.results ?? templates.data ?? []).map((t) => (
              <TemplateEditor key={t.id} template={t} onSave={(body) => saveTpl.mutate({ id: t.id, body })}
                saving={saveTpl.isPending} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateEditor({ template, onSave, saving }) {
  const [body, setBody] = useState(template.body)
  const dirty = body !== template.body
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-700">{template.key_display}</span>
        {dirty && (
          <button onClick={() => onSave(body)} disabled={saving}
            className="text-xs text-primary hover:underline disabled:opacity-40">Save</button>
        )}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono" />
      <p className="text-[11px] text-gray-400 mt-1">
        Placeholders: {(template.placeholders ?? []).map((p) => `{${p}}`).join(' ')}
      </p>
    </div>
  )
}

// ── SMS channel ─────────────────────────────────────────────────────────

export default function SmsChannel() {
  const { user } = useAuth()
  const [tab, setTab] = useState('compose')
  const config = useQuery({ queryKey: ['sms-config'], queryFn: getSmsConfig })

  if (config.isLoading) {
    return <div className="p-6"><Skeleton className="h-64" /></div>
  }
  if (config.isError) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-red-600">
        <AlertTriangle size={16} /> The SMS module is not available.
      </div>
    )
  }

  const cfg = { ...config.data, role: config.data.role || user?.role }
  const TABS = [
    { key: 'compose', label: 'Compose', Icon: Send },
    { key: 'log', label: 'Delivery log', Icon: Clock },
    ...(cfg.can_configure ? [{ key: 'settings', label: 'Settings', Icon: Settings }] : []),
  ]

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'compose' && <ComposeTab config={cfg} />}
      {tab === 'log' && <LogTab />}
      {tab === 'settings' && cfg.can_configure && <SettingsTab config={cfg} />}
    </div>
  )
}
