import { useQuery } from '@tanstack/react-query'
import { Award, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react'
import { getSchoolPerformance } from '../../api/exams'
import { LEVEL_LABEL } from '../../lib/constants'

const CAN_SEE_ROLES = ['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER']

function Skeleton({ className }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

const defaultSubtitle = (it) => `${it.student_count} student${it.student_count !== 1 ? 's' : ''}`

function RankTile({ title, icon: Icon, tone, items, labelFn, subtitleFn = defaultSubtitle, loading }) {
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
      ) : !items?.length ? (
        <p className="text-xs text-gray-400 py-6 text-center">No exam data yet.</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((it, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{i + 1}. {labelFn(it)}</p>
                <p className="text-[11px] text-gray-400 truncate">{subtitleFn(it)}</p>
              </div>
              <span className="font-mono font-semibold text-gray-800 shrink-0">{it.average}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Owner/Headteacher/Academic Teacher dashboard snapshot: top/bottom classes
 * and subjects for the most recent exam with marks. Renders nothing for any
 * other role, or if the `reports` module is disabled.
 */
export default function SchoolPerformancePanels({ role, enabledModules }) {
  const enabled = CAN_SEE_ROLES.includes(role) && enabledModules.includes('reports')

  const { data, isLoading } = useQuery({
    queryKey: ['dash-school-performance'],
    queryFn: getSchoolPerformance,
    enabled,
  })

  if (!enabled) return null

  const classLabel = (c) => `${LEVEL_LABEL[c.level] ?? c.level}${c.stream ? ` ${c.stream}` : ''}`
  const subjectLabel = (s) => `${s.name} (${s.code})`
  // A subject average is only meaningful alongside which class it's for —
  // English in Std 3A isn't comparable to English in Std 1B.
  const subjectSubtitle = (s) =>
    `${classLabel(s)} · ${s.student_count} student${s.student_count !== 1 ? 's' : ''}`

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">School Performance</h2>
        {data?.exam && (
          <span className="text-xs text-gray-400 truncate max-w-[60%]">{data.exam.name}</span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <RankTile
          title="Top Classes" icon={TrendingUp} tone="up"
          items={data?.top_classes} labelFn={classLabel} loading={isLoading}
        />
        <RankTile
          title="Classes Needing Attention" icon={TrendingDown} tone="down"
          items={data?.bottom_classes} labelFn={classLabel} loading={isLoading}
        />
        <RankTile
          title="Top Subjects" icon={Award} tone="up"
          items={data?.top_subjects} labelFn={subjectLabel} subtitleFn={subjectSubtitle} loading={isLoading}
        />
        <RankTile
          title="Subjects Needing Attention" icon={AlertTriangle} tone="down"
          items={data?.bottom_subjects} labelFn={subjectLabel} subtitleFn={subjectSubtitle} loading={isLoading}
        />
      </div>
    </div>
  )
}
