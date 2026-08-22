import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Trophy } from 'lucide-react'
import { useState } from 'react'
import { getMySubjectPerformance } from '../../api/exams'
import Badge from '../ui/Badge'
import { GRADE_BADGE } from '../../lib/constants'

function Skeleton({ className }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

function StudentRankTile({ title, icon: Icon, tone, rows, loading, exam }) {
  const toneCls = tone === 'up' ? 'text-success' : 'text-danger'
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className={toneCls} />
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</h3>
      </div>
      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : !rows?.length ? (
        <p className="text-xs text-gray-400 py-6 text-center">
          {exam ? 'No marks entered yet.' : 'No exam recorded for this subject yet.'}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((s, i) => (
            <div key={s.student_id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{i + 1}. {s.full_name}</p>
                <p className="text-[11px] text-gray-400 font-mono">{s.student_id}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono font-semibold text-gray-800">{parseFloat(s.score).toFixed(0)}</span>
                <Badge label={s.grade} colorClass={GRADE_BADGE[s.grade]} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Teacher dashboard snapshot: top 5 / bottom 5 students in one of the
 * teacher's assigned subjects, for the most recent exam with marks in it.
 * Renders nothing if the teacher has no subjects assigned (nothing to show)
 * or if the `reports` module is disabled.
 */
export default function MySubjectPerformancePanels({ enabledModules }) {
  const reportsEnabled = enabledModules.includes('reports')
  const [subjectId, setSubjectId] = useState('')

  const { data, isLoading, isFetched } = useQuery({
    queryKey: ['dash-my-subject-performance', subjectId],
    queryFn: () => getMySubjectPerformance(subjectId ? { subject_id: subjectId } : {}),
    enabled: reportsEnabled,
  })

  if (!reportsEnabled) return null
  // Nothing assigned to this teacher — nothing meaningful to show.
  if (isFetched && (data?.subjects?.length ?? 0) === 0) return null

  const subjects = data?.subjects ?? []
  const currentSubjectId = subjectId || data?.subject?.id || ''

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">My Subject Performance</h2>
        {subjects.length > 1 && (
          <select
            value={currentSubjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white
              focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </select>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StudentRankTile
          title="Top 5 Performers" icon={Trophy} tone="up"
          rows={data?.top_students} loading={isLoading} exam={data?.exam}
        />
        <StudentRankTile
          title="Needs Support" icon={AlertTriangle} tone="down"
          rows={data?.bottom_students} loading={isLoading} exam={data?.exam}
        />
      </div>
    </div>
  )
}
