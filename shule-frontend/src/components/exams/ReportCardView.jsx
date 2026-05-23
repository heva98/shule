import { Printer, X } from 'lucide-react'

// Tanzania grading scale
function gradeFromScore(score) {
  const s = parseFloat(score)
  if (isNaN(s)) return ''
  if (s >= 75) return 'A'
  if (s >= 60) return 'B'
  if (s >= 45) return 'C'
  if (s >= 30) return 'D'
  return 'F'
}

const GRADE_COLOR = {
  A: 'text-green-600',
  B: 'text-blue-600',
  C: 'text-yellow-600',
  D: 'text-orange-500',
  F: 'text-red-600',
}

function ordinal(n) {
  if (!n) return '—'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function buildPrintHtml(rc) {
  const subjectRows = (rc.subjects ?? [])
    .map(
      (s) => `
      <tr>
        <td>${s.subject_code}</td>
        <td>${s.subject_name}</td>
        <td class="num">${s.score}</td>
        <td class="grade ${gradeClass(s.grade || gradeFromScore(s.score))}">${s.grade || gradeFromScore(s.score)}</td>
        <td>${s.remarks || ''}</td>
      </tr>`
    )
    .join('')

  function gradeClass(g) {
    return { A: 'g-a', B: 'g-b', C: 'g-c', D: 'g-d', F: 'g-f' }[g] ?? ''
  }

  const summary = rc.summary ?? {}
  const student = rc.student ?? {}
  const exam    = rc.exam ?? {}

  const divisionLine = summary.division
    ? `<span><strong>Division:</strong> ${summary.division}</span>`
    : summary.aggregate != null
    ? `<span><strong>Aggregate:</strong> ${summary.aggregate}</span>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Report Card – ${student.full_name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; }
  .header { text-align: center; border-bottom: 2px solid #1B4F72; padding-bottom: 12px; margin-bottom: 16px; }
  .header h1 { font-size: 20px; color: #1B4F72; letter-spacing: 0.5px; }
  .header p { font-size: 12px; color: #555; margin-top: 3px; }
  .title { text-align: center; font-size: 15px; font-weight: 700; color: #1B4F72;
           text-transform: uppercase; letter-spacing: 1px; margin: 10px 0 14px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 16px;
               border: 1px solid #ddd; border-radius: 6px; padding: 10px 14px; background: #f9f9f9; }
  .meta-grid span { font-size: 12px; }
  .meta-grid strong { color: #444; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #1B4F72; color: #fff; padding: 7px 8px; text-align: left; font-size: 12px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 12.5px; }
  tr:nth-child(even) td { background: #f4f8fb; }
  .num { text-align: center; }
  .grade { text-align: center; font-weight: 700; }
  .g-a { color: #16a34a; }  .g-b { color: #2563eb; }
  .g-c { color: #ca8a04; }  .g-d { color: #ea580c; }  .g-f { color: #dc2626; }
  .summary { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 20px;
             border: 1px solid #c8dced; border-radius: 6px; padding: 10px 14px; background: #eaf3fb; }
  .summary span { font-size: 12.5px; }
  .summary strong { color: #1B4F72; }
  .sigs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 32px; }
  .sig-box { border-top: 1px solid #333; padding-top: 4px; font-size: 11.5px; text-align: center; }
  .sig-box .name { font-size: 12px; font-weight: 600; margin-top: 2px; }
  .remarks-box { border: 1px solid #ddd; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; }
  .remarks-box h3 { font-size: 12px; color: #555; margin-bottom: 6px; }
  .remarks-box p { font-size: 12.5px; min-height: 32px; }
  @media print {
    body { padding: 16px; }
    button { display: none; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>SHULE MANAGEMENT SYSTEM</h1>
    <p>Academic Report Card</p>
  </div>
  <div class="title">Student Report Card</div>

  <div class="meta-grid">
    <span><strong>Name:</strong> ${student.full_name}</span>
    <span><strong>Student ID:</strong> ${student.student_id}</span>
    <span><strong>Level:</strong> ${student.level}${student.stream ? ` / Stream ${student.stream}` : ''}</span>
    <span><strong>Gender:</strong> ${student.gender}</span>
    <span><strong>Exam:</strong> ${exam.name}</span>
    <span><strong>Term:</strong> ${(exam.term || '').replace('TERM', 'Term ')}</span>
    <span><strong>Type:</strong> ${exam.exam_type}</span>
    <span><strong>Academic Year:</strong> ${exam.academic_year}</span>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:60px">Code</th>
        <th>Subject</th>
        <th style="width:60px;text-align:center">Score</th>
        <th style="width:50px;text-align:center">Grade</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>${subjectRows}</tbody>
  </table>

  <div class="summary">
    <span><strong>Total Score:</strong> ${summary.total_score}</span>
    <span><strong>Average:</strong> ${summary.average_score}</span>
    <span><strong>Subjects Sat:</strong> ${summary.subjects_sat}</span>
    <span><strong>Position:</strong> ${ordinal(summary.position)} / ${summary.class_size}</span>
    ${divisionLine}
  </div>

  <div class="remarks-box">
    <h3>Class Teacher's Remarks</h3>
    <p>&nbsp;</p>
  </div>

  <div class="sigs">
    <div class="sig-box">
      <div class="name">${rc.class_teacher || '___________________'}</div>
      Class Teacher
    </div>
    <div class="sig-box">
      <div class="name">${rc.headteacher || '___________________'}</div>
      Headteacher
    </div>
    <div class="sig-box">
      <div class="name">___________________</div>
      Parent / Guardian
    </div>
  </div>
</body>
</html>`
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ReportCardView({ reportCard: rc, onClose }) {
  if (!rc) return null

  const student  = rc.student  ?? {}
  const exam     = rc.exam     ?? {}
  const summary  = rc.summary  ?? {}
  const subjects = rc.subjects ?? []

  function handlePrint() {
    const w = window.open('', '_blank', 'width=800,height=900')
    if (!w) return
    w.document.write(buildPrintHtml(rc))
    w.document.close()
    setTimeout(() => { w.print(); w.close() }, 400)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Modal header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <div>
          <h2 className="font-semibold text-gray-900">Report Card</h2>
          <p className="text-xs text-gray-400 mt-0.5">{student.full_name} · {exam.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg
              text-sm font-medium hover:bg-secondary transition-colors"
          >
            <Printer size={14} />
            Print
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* Student + exam meta */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 bg-gray-50 rounded-xl border border-gray-100 p-4 text-sm">
          <MetaRow label="Name"       value={student.full_name} />
          <MetaRow label="Student ID" value={student.student_id} mono />
          <MetaRow
            label="Level"
            value={`${student.level}${student.stream ? ` / Stream ${student.stream}` : ''}`}
          />
          <MetaRow label="Gender" value={student.gender} />
          <MetaRow label="Exam"   value={exam.name} />
          <MetaRow label="Term"   value={(exam.term ?? '').replace('TERM', 'Term ')} />
          <MetaRow label="Type"   value={exam.exam_type} />
          <MetaRow label="Year"   value={String(exam.academic_year ?? '')} />
        </div>

        {/* Subjects table */}
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-16">Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Subject</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 w-16">Score</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 w-14">Grade</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {subjects.map((s, i) => {
                const g = s.grade || gradeFromScore(s.score)
                return (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2 text-xs font-mono text-gray-500">{s.subject_code}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">{s.subject_name}</td>
                    <td className="px-4 py-2 text-center font-mono tabular-nums">{s.score}</td>
                    <td className={`px-4 py-2 text-center font-bold text-sm ${GRADE_COLOR[g] ?? ''}`}>{g}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{s.remarks || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <SummaryCard label="Total Score"   value={summary.total_score} />
          <SummaryCard label="Average"       value={summary.average_score} />
          <SummaryCard label="Subjects Sat"  value={summary.subjects_sat} />
          <SummaryCard
            label="Position"
            value={summary.position
              ? `${ordinal(summary.position)} / ${summary.class_size}`
              : '—'}
            highlight
          />
          {summary.division != null && (
            <SummaryCard label="Division" value={summary.division} highlight />
          )}
          {summary.aggregate != null && (
            <SummaryCard label="Aggregate" value={summary.aggregate} highlight />
          )}
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-4 pt-4">
          <SigBox title="Class Teacher" name={rc.class_teacher} />
          <SigBox title="Headteacher"   name={rc.headteacher} />
          <SigBox title="Parent / Guardian" />
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MetaRow({ label, value, mono }) {
  return (
    <div className="flex gap-1.5">
      <span className="text-xs text-gray-400 shrink-0 w-24">{label}</span>
      <span className={`text-xs font-medium text-gray-800 ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  )
}

function SummaryCard({ label, value, highlight }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-center
      ${highlight ? 'bg-primary/5 border-primary/20' : 'bg-gray-50 border-gray-100'}`}>
      <div className={`text-lg font-bold ${highlight ? 'text-primary' : 'text-gray-900'}`}>
        {value ?? '—'}
      </div>
      <div className="text-[11px] text-gray-400 mt-0.5">{label}</div>
    </div>
  )
}

function SigBox({ title, name }) {
  return (
    <div className="text-center">
      <div className="border-t border-gray-300 pt-2 mt-8">
        {name && <div className="text-xs font-semibold text-gray-700">{name}</div>}
        <div className="text-[11px] text-gray-400 mt-0.5">{title}</div>
      </div>
    </div>
  )
}
