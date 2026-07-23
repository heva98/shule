import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  Printer,
  Trash2,
  User,
} from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getAttendanceRecords, getAttendanceSummary } from '../../api/attendance'
import { getExams } from '../../api/exams'
import { getInvoices } from '../../api/fees'
import { createStudentDocument, deleteStudentDocument, getStudentDocuments } from '../../api/documents'
import { getStudent, getStudentReportCard } from '../../api/students'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Skeleton from '../../components/ui/Skeleton'
import Tabs from '../../components/ui/Tabs'
import { useAuth } from '../../context/AuthContext'
import {
  ATT_BADGE,
  GRADE_BADGE,
  INVOICE_BADGE,
  LEVEL_LABEL,
  STATUS_BADGE,
} from '../../lib/constants'
import { formatTZS } from '../../lib/format'

const READ_ONLY_ROLES = ['TEACHER', 'BURSAR']

// Documents (birth certificates, medical forms, etc.) are sensitive — only senior
// staff can see the tab at all, matching the backend's own access restriction.
const DOCUMENT_ROLES = ['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER']

const DOCUMENT_CATEGORIES = [
  { value: 'BIRTH_CERTIFICATE', label: 'Birth Certificate' },
  { value: 'TRANSFER_LETTER', label: 'Transfer Letter' },
  { value: 'MEDICAL_FORM', label: 'Medical Form' },
  { value: 'IMMUNIZATION_RECORD', label: 'Immunization Record' },
  { value: 'NATIONAL_ID', label: 'National ID / Passport' },
  { value: 'OTHER', label: 'Other' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function waUrl(phone) {
  if (!phone) return null
  return `https://wa.me/${phone.replace(/\D/g, '')}`
}

function DetailRow({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-4 py-2 border-b border-gray-50 last:border-0">
      <dt className="text-xs text-gray-400 sm:w-36 shrink-0">{label}</dt>
      <dd className="text-sm text-gray-800">{value || <span className="text-gray-300">—</span>}</dd>
    </div>
  )
}

function InfoSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex gap-4 py-2 border-b border-gray-50">
          <Skeleton className="h-3 w-28 shrink-0" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  )
}

// ── Overview tab ───────────────────────────────────────────────────────────

function OverviewTab({ student }) {
  const genderLabel = student.gender === 'M' ? 'Male' : student.gender === 'F' ? 'Female' : student.gender

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Personal details */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Personal Details</h3>
        <dl>
          <DetailRow label="Student ID"   value={student.student_id} />
          <DetailRow label="Full Name"    value={student.full_name} />
          <DetailRow label="Date of Birth" value={student.date_of_birth} />
          <DetailRow label="Gender"       value={genderLabel} />
          <DetailRow label="Level"        value={LEVEL_LABEL[student.level] ?? student.level} />
          <DetailRow label="Stream"       value={student.stream} />
          <DetailRow label="Admission"    value={student.admission_date} />
          <DetailRow label="NEMIS ID"     value={student.nemis_id} />
          {student.has_special_needs && (
            <DetailRow label="Special Needs" value={student.special_needs_notes || 'Yes'} />
          )}
        </dl>
      </div>

      {/* Guardian cards */}
      <div className="space-y-3">
        {student.guardians?.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-sm text-gray-400">
            No guardians on record.
          </div>
        )}
        {student.guardians?.map((g) => {
          const whatsapp = waUrl(g.whatsapp_phone || g.phone)
          return (
            <div
              key={g.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{g.full_name}</p>
                  <p className="text-xs text-gray-400 capitalize">{g.relationship.toLowerCase()}</p>
                </div>
                {g.is_primary_contact && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    Primary
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <a
                  href={`tel:${g.phone}`}
                  className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-primary
                    border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <Phone size={12} />
                  {g.phone}
                </a>
                {whatsapp && (
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs text-white bg-[#25D366]
                      rounded-lg px-3 py-1.5 hover:bg-[#1ebe5d] transition-colors"
                  >
                    <MessageCircle size={12} />
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Fees tab ───────────────────────────────────────────────────────────────

function FeesTab({ studentId }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoices', studentId],
    queryFn: () => getInvoices({ student: studentId }),
  })

  const invoices = data?.results ?? data ?? []

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <p className="text-sm text-danger text-center">Failed to load invoices.</p>
      </div>
    )
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
        <p className="text-sm text-gray-400">No invoices found for this student.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60">
            {['Term', 'Amount Due', 'Paid', 'Balance', 'Due Date', 'Status'].map((h) => (
              <th
                key={h}
                className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {invoices.map((inv) => (
            <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                {inv.academic_year} · {inv.term?.replace('TERM', 'Term ')}
              </td>
              <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-mono text-xs">
                {formatTZS(inv.amount_due)}
              </td>
              <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-mono text-xs">
                {formatTZS(inv.amount_paid)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                <span className={Number(inv.balance) > 0 ? 'text-danger' : 'text-success'}>
                  {formatTZS(inv.balance)}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{inv.due_date}</td>
              <td className="px-4 py-3">
                <Badge label={inv.status} colorClass={INVOICE_BADGE[inv.status]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Attendance tab ─────────────────────────────────────────────────────────

function AttendanceTab({ studentId }) {
  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['att-summary', studentId],
    queryFn: () => getAttendanceSummary(studentId),
  })

  const { data: records, isLoading: recLoading } = useQuery({
    queryKey: ['att-records', studentId],
    queryFn: () => getAttendanceRecords({ student: studentId }),
  })

  const rows = records?.results ?? records ?? []

  const stats = [
    { label: 'Total Days', value: summary?.total_days ?? '—', color: 'text-gray-700' },
    { label: 'Present', value: summary?.present ?? '—', color: 'text-success' },
    { label: 'Absent', value: summary?.absent ?? '—', color: 'text-danger' },
    { label: 'Late', value: summary?.late ?? '—', color: 'text-accent' },
    { label: 'Excused', value: summary?.excused ?? '—', color: 'text-secondary' },
    {
      label: 'Rate',
      value: summary?.attendance_percent ? `${summary.attendance_percent}%` : '—',
      color: 'text-primary',
    },
  ]

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center"
          >
            {sumLoading ? (
              <Skeleton className="h-6 w-12 mx-auto mb-1" />
            ) : (
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Records table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-700">Recent Records</p>
        </div>
        {recLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No attendance records found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Date', 'Session', 'Status', 'Reason'].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.slice(0, 30).map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{r.date}</td>
                  <td className="px-4 py-2.5 text-gray-500 capitalize">
                    {r.session?.toLowerCase()}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge label={r.status} colorClass={ATT_BADGE[r.status]} />
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs max-w-[200px] truncate">
                    {r.reason || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Results tab ────────────────────────────────────────────────────────────

function ResultsTab({ student }) {
  const [selectedExam, setSelectedExam] = useState('')

  const { data: exams, isLoading: examsLoading } = useQuery({
    queryKey: ['exams', student.level],
    queryFn: () => getExams({ level: student.level }),
  })

  const examList = exams?.results ?? exams ?? []

  const { data: reportCard, isLoading: rcLoading, isError: rcError } = useQuery({
    queryKey: ['report-card', student.public_id, selectedExam],
    queryFn: () => getStudentReportCard(student.public_id, selectedExam),
    enabled: !!selectedExam,
  })

  function printReportCard() {
    window.print()
  }

  return (
    <div className="space-y-5">
      {/* Exam selector */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Select Exam
        </label>
        {examsLoading ? (
          <Skeleton className="h-9 w-64 rounded-lg" />
        ) : (
          <select
            value={selectedExam}
            onChange={(e) => setSelectedExam(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white
              focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary w-full sm:w-64"
          >
            <option value="">Select an exam to view report card…</option>
            {examList.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name} — {ex.term?.replace('TERM', 'Term ')} ({ex.exam_type})
              </option>
            ))}
          </select>
        )}
        {examList.length === 0 && !examsLoading && (
          <p className="text-xs text-gray-400 mt-2">
            No exams found for {LEVEL_LABEL[student.level] ?? student.level}.
          </p>
        )}
      </div>

      {/* Report card */}
      {selectedExam && (
        <>
          {rcLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded" />)}
            </div>
          ) : rcError ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm text-danger text-center">
                Failed to load report card. The student may not have results for this exam.
              </p>
            </div>
          ) : reportCard ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Report header */}
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{reportCard.exam?.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {reportCard.exam?.term?.replace('TERM', 'Term ')} · {reportCard.exam?.academic_year}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={printReportCard}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300
                        rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Printer size={13} />
                      Print
                    </button>
                    <button
                      onClick={printReportCard}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white
                        rounded-lg text-xs font-medium hover:bg-secondary transition-colors"
                    >
                      <Download size={13} />
                      Download
                    </button>
                  </div>
                </div>

                {/* Summary row */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    {
                      label: 'Position',
                      value: reportCard.summary?.position
                        ? `${reportCard.summary.position} / ${reportCard.summary.class_size}`
                        : '—',
                    },
                    { label: 'Subjects', value: reportCard.summary?.subjects_sat ?? '—' },
                    { label: 'Total Score', value: reportCard.summary?.total_score ?? '—' },
                    {
                      label: reportCard.summary?.division != null ? 'Division' : 'Aggregate',
                      value:
                        reportCard.summary?.division != null
                          ? `Division ${reportCard.summary.division}`
                          : reportCard.summary?.aggregate != null
                          ? `Agg. ${reportCard.summary.aggregate}`
                          : '—',
                    },
                  ].map((s) => (
                    <div key={s.label} className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className="text-base font-bold text-gray-900">{s.value}</p>
                      <p className="text-xs text-gray-400">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Subjects table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {['Subject', 'Code', 'Score', 'Grade', 'Remarks'].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reportCard.subjects?.map((s) => (
                    <tr key={s.subject_code} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-800 font-medium">{s.subject_name}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.subject_code}</td>
                      <td className="px-4 py-3 text-gray-700 font-mono">{s.score}</td>
                      <td className="px-4 py-3">
                        <Badge label={s.grade} colorClass={GRADE_BADGE[s.grade]} />
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{s.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Footer */}
              {(reportCard.class_teacher || reportCard.headteacher) && (
                <div className="px-5 py-3 border-t border-gray-100 flex gap-8 text-xs text-gray-500">
                  {reportCard.class_teacher && (
                    <span>Class Teacher: <strong>{reportCard.class_teacher}</strong></span>
                  )}
                  {reportCard.headteacher && (
                    <span>Head Teacher: <strong>{reportCard.headteacher}</strong></span>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

// ── Documents tab ──────────────────────────────────────────────────────────

function UploadDocumentModal({ studentId, onClose }) {
  const qc = useQueryClient()
  const [file, setFile] = useState(null)
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { category: 'BIRTH_CERTIFICATE' },
  })

  const saveMut = useMutation({
    mutationFn: (data) => {
      const fd = new FormData()
      fd.append('student', studentId)
      fd.append('category', data.category)
      if (data.title) fd.append('title', data.title)
      if (data.notes) fd.append('notes', data.notes)
      fd.append('file', file)
      return createStudentDocument(fd)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-documents', studentId] })
      toast.success('Document uploaded.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to upload.'),
  })

  return (
    <Modal isOpen title="Upload Document" onClose={onClose} size="sm">
      <form
        onSubmit={handleSubmit((d) => saveMut.mutate(d))}
        className="p-6 space-y-4"
      >
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Category *</label>
          <select {...register('category', { required: true })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            {DOCUMENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Title <span className="text-gray-400 font-normal">(optional)</span></label>
          <input {...register('title')} placeholder="e.g. Birth certificate — updated 2026"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">File *</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea {...register('notes')} rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={!file || saveMut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {saveMut.isPending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteDocumentModal({ doc, studentId, onClose }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => deleteStudentDocument(doc.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-documents', studentId] })
      toast.success('Document removed.')
      onClose()
    },
    onError: () => toast.error('Failed to remove.'),
  })
  return (
    <Modal isOpen title="Remove Document" onClose={onClose} size="sm">
      <div className="p-6 space-y-4">
        <p className="text-sm text-gray-600">
          Remove <strong>{doc.title || doc.category_display}</strong>? This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="flex-1 py-2.5 bg-danger text-white rounded-lg text-sm font-medium hover:bg-danger/90 disabled:opacity-50">
            {mut.isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DocumentsTab({ studentId }) {
  const [showUpload, setShowUpload] = useState(false)
  const [deleteDoc, setDeleteDoc] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['student-documents', studentId],
    queryFn: () => getStudentDocuments({ student: studentId }),
  })
  const documents = data?.results ?? data ?? []

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
          <Plus size={14} /> Upload Document
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </div>
      ) : isError ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-danger text-center">Failed to load documents.</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <FileText size={28} className="mx-auto text-gray-200 mb-2" />
          <p className="text-sm text-gray-400">No documents on file for this student.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText size={16} className="text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {doc.title || doc.category_display}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {doc.category_display} &middot; Uploaded {doc.uploaded_at?.slice(0, 10)}
                  {doc.uploaded_by_name ? ` by ${doc.uploaded_by_name}` : ''}
                </p>
                {doc.notes && <p className="text-xs text-gray-500 mt-1">{doc.notes}</p>}
              </div>
              <a href={doc.file} target="_blank" rel="noreferrer"
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-primary transition-colors shrink-0" title="Download">
                <Download size={15} />
              </a>
              <button onClick={() => setDeleteDoc(doc)}
                className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-danger transition-colors shrink-0" title="Remove">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showUpload && <UploadDocumentModal studentId={studentId} onClose={() => setShowUpload(false)} />}
      {deleteDoc && <DeleteDocumentModal doc={deleteDoc} studentId={studentId} onClose={() => setDeleteDoc(null)} />}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

const BASE_TABS = [
  { id: 'overview',    label: 'Overview' },
  { id: 'fees',        label: 'Fees' },
  { id: 'attendance',  label: 'Attendance' },
  { id: 'results',     label: 'Results' },
]

export default function StudentDetailPage() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { user }  = useAuth()
  const readOnly  = READ_ONLY_ROLES.includes(user?.role)
  const canSeeDocuments = DOCUMENT_ROLES.includes(user?.role)
  const TABS = canSeeDocuments
    ? [...BASE_TABS, { id: 'documents', label: 'Documents' }]
    : BASE_TABS

  const [activeTab, setActiveTab] = useState('overview')

  const { data: student, isLoading, isError } = useQuery({
    queryKey: ['student', id],
    queryFn: () => getStudent(id),
  })

  if (isLoading) {
    return (
      <div className="space-y-5">
        {/* Header skeleton */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex items-center gap-5">
          <Skeleton className="w-20 h-20 rounded-full shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-5 w-20 rounded" />
          </div>
        </div>
        <InfoSkeleton />
      </div>
    )
  }

  if (isError || !student) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
        <User size={40} className="mx-auto text-gray-200 mb-3" />
        <p className="text-sm text-danger">Student not found or failed to load.</p>
        <button
          onClick={() => navigate('/students')}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Back to Students
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Profile header ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/students')}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors shrink-0 mt-0.5"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex items-center gap-4 flex-1 min-w-0">
            {student.photo ? (
              <img
                src={student.photo}
                alt=""
                className="w-16 h-16 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold shrink-0">
                {student.first_name?.[0]}{student.last_name?.[0]}
              </div>
            )}

            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900 truncate">{student.full_name}</h1>
              <p className="text-sm text-gray-400 font-mono">{student.student_id}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <Badge label={student.status} colorClass={STATUS_BADGE[student.status]} />
                <span className="text-xs text-gray-500">
                  {LEVEL_LABEL[student.level] ?? student.level}
                  {student.stream && ` · ${student.stream}`}
                </span>
              </div>
            </div>
          </div>

          {!readOnly && (
            <button
              onClick={() => navigate(`/students/${id}/edit`)}
              className="shrink-0 px-3 py-1.5 border border-gray-300 rounded-lg text-sm
                text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* ── Tab panels ── */}
      <div>
        {activeTab === 'overview'   && <OverviewTab student={student} />}
        {activeTab === 'fees'       && <FeesTab studentId={student.id} />}
        {activeTab === 'attendance' && <AttendanceTab studentId={student.id} />}
        {activeTab === 'results'    && <ResultsTab student={student} />}
        {activeTab === 'documents'  && canSeeDocuments && <DocumentsTab studentId={student.id} />}
      </div>

    </div>
  )
}
