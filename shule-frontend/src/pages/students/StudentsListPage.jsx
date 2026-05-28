import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, Search, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStudents } from '../../api/students'
import Badge from '../../components/ui/Badge'
import Skeleton from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { LEVEL_LABEL, STATUS_BADGE, STATUS_OPTIONS } from '../../lib/constants'
import { useSchoolLevels } from '../../hooks/useSchoolLevels'

const READ_ONLY_ROLES = ['TEACHER', 'BURSAR']

function exportCSV(students) {
  const headers = ['Student ID', 'Full Name', 'Level', 'Stream', 'Status', 'Admission Date']
  const cols    = ['student_id', 'full_name',  'level', 'stream', 'status', 'admission_date']
  const rows = students.map((s) =>
    cols.map((c) => `"${String(s[c] ?? '').replace(/"/g, '""')}"`)
  )
  const csv  = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `students-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function StudentAvatar({ student }) {
  if (student.photo) {
    return (
      <img
        src={student.photo}
        alt=""
        className="w-9 h-9 rounded-full object-cover shrink-0"
      />
    )
  }
  return (
    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
      {student.first_name?.[0]}
      {student.last_name?.[0]}
    </div>
  )
}

function TableSkeleton() {
  return (
    <>
      {[...Array(8)].map((_, i) => (
        <tr key={i} className="border-b border-gray-50">
          <td className="px-4 py-3"><Skeleton className="h-3.5 w-28" /></td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Skeleton className="w-9 h-9 rounded-full shrink-0" />
              <Skeleton className="h-3.5 w-32" />
            </div>
          </td>
          <td className="px-4 py-3"><Skeleton className="h-3.5 w-20" /></td>
          <td className="px-4 py-3"><Skeleton className="h-3.5 w-6" /></td>
          <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded" /></td>
          <td className="px-4 py-3"><Skeleton className="h-3.5 w-24" /></td>
        </tr>
      ))}
    </>
  )
}

function Pagination({ page, totalPages, count, onChange }) {
  const pages = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else if (page <= 4) {
    pages.push(1, 2, 3, 4, 5, '…', totalPages)
  } else if (page >= totalPages - 3) {
    pages.push(1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
  } else {
    pages.push(1, '…', page - 1, page, page + 1, '…', totalPages)
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <p className="text-xs text-gray-500">
        {count} student{count !== 1 ? 's' : ''}
      </p>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={15} />
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="w-7 text-center text-xs text-gray-400">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`w-7 h-7 text-xs rounded-md transition-colors ${
                p === page
                  ? 'bg-primary text-white'
                  : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 transition-colors"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}

export default function StudentsListPage() {
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const readOnly  = READ_ONLY_ROLES.includes(user?.role)
  const { levelOptions } = useSchoolLevels()

  const [search,         setSearch]         = useState('')
  const [debouncedSearch, setDebounced]     = useState('')
  const [levelFilter,    setLevelFilter]    = useState('')
  const [statusFilter,   setStatusFilter]   = useState('')
  const [page,           setPage]           = useState(1)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => setPage(1), [debouncedSearch, levelFilter, statusFilter])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['students', debouncedSearch, levelFilter, statusFilter, page],
    queryFn: () =>
      getStudents({
        search:  debouncedSearch || undefined,
        level:   levelFilter    || undefined,
        status:  statusFilter   || undefined,
        page,
      }),
    placeholderData: (prev) => prev,
  })

  const students   = data?.results ?? []
  const count      = data?.count   ?? 0
  const totalPages = Math.max(1, Math.ceil(count / 20))

  const selectCls = `border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700
    focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white`

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name or student ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm
              focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className={selectCls}>
          <option value="">All Levels</option>
          {levelOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => students.length && exportCSV(students)}
            disabled={!students.length}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg
              text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <Download size={15} />
            Export
          </button>

          {!readOnly && (
            <button
              onClick={() => navigate('/students/new')}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg
                text-sm font-medium hover:bg-secondary transition-colors whitespace-nowrap"
            >
              <UserPlus size={15} />
              Add Student
            </button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Student ID', 'Name', 'Level', 'Stream', 'Status', 'Admitted'].map((h) => (
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
              {isLoading ? (
                <TableSkeleton />
              ) : isError ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-danger">
                    Failed to load students. Check your connection and try again.
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-sm text-gray-400">
                    {debouncedSearch || levelFilter || statusFilter
                      ? 'No students match the current filters.'
                      : 'No students enrolled yet. Click "Add Student" to get started.'}
                  </td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr
                    key={student.id}
                    onClick={() => navigate(`/students/${student.id}`)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                      {student.student_id}
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <div className="flex items-center gap-2.5">
                        <StudentAvatar student={student} />
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">{student.full_name}</div>
                          {student.nemis_id && (
                            <div className="text-xs text-gray-400 truncate">NEMIS: {student.nemis_id}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {LEVEL_LABEL[student.level] ?? student.level}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {student.stream || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        label={student.status}
                        colorClass={STATUS_BADGE[student.status]}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {student.admission_date}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {count > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            count={count}
            onChange={setPage}
          />
        )}
      </div>
    </div>
  )
}
