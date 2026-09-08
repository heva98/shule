import { useQuery } from '@tanstack/react-query'
import { Search, UserRound } from 'lucide-react'
import { useState } from 'react'
import { getStudents } from '../../api/students'
import { LEVEL_LABEL } from '../../lib/constants'

/** Type-ahead student search. Calls onPick(student) with the full row. */
export default function StudentPicker({ onPick, placeholder = 'Search student by name or ID…' }) {
  const [q, setQ] = useState('')
  const { data, isFetching } = useQuery({
    queryKey: ['student-search', q],
    queryFn: () => getStudents({ search: q, status: 'ACTIVE' }),
    enabled: q.trim().length >= 2,
  })
  const results = data?.results ?? data ?? []

  return (
    <div className="relative w-full max-w-sm">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm
          focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
      {q.trim().length >= 2 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {isFetching ? (
            <div className="px-3 py-3 text-sm text-gray-400">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400">No matches.</div>
          ) : (
            results.slice(0, 20).map((s) => (
              <button
                key={s.id}
                onClick={() => { onPick(s); setQ('') }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <UserRound size={14} className="text-gray-400" />
                <span className="font-medium text-gray-800">{s.full_name}</span>
                <span className="text-xs text-gray-400 font-mono ml-auto">{s.student_id}</span>
                <span className="text-xs text-gray-400">{LEVEL_LABEL[s.level] || s.level}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
