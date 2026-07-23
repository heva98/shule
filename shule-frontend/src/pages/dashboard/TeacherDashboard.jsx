import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  CalendarClock,
  ClipboardList,
  ShieldAlert,
  Users,
} from 'lucide-react'
import StatCard from '../../components/ui/StatCard'
import { useAuth } from '../../context/AuthContext'
import { getPeriods, getTimetableEntries } from '../../api/timetable'
import { getHomePackages } from '../../api/homepackages'
import { getExams } from '../../api/exams'
import { getMyClass, getDisciplinaryIncidents } from '../../api/staff'
import { LEVEL_LABEL } from '../../lib/constants'

// ── Helpers ────────────────────────────────────────────────────────────────────

const DAY_OF_WEEK_BY_JS_DAY = ['', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function todayCode() {
  return DAY_OF_WEEK_BY_JS_DAY[new Date().getDay()] ?? ''
}

function classLabel(level, stream) {
  return `${LEVEL_LABEL[level] ?? level}${stream ? ` ${stream}` : ''}`
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtTime(t) {
  return t?.slice(0, 5) ?? ''
}

function Skeleton({ className }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

function EmptyState({ icon: Icon, message }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
      <Icon size={28} className="mb-2 text-gray-200" />
      {message}
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function TeacherDashboard() {
  const { user } = useAuth()
  const role = user?.role

  const timetableQ = useQuery({
    queryKey: ['dash-my-timetable'],
    queryFn: () => getTimetableEntries({ mine: 'true' }),
  })
  const periodsQ = useQuery({ queryKey: ['dash-periods'], queryFn: getPeriods })
  const homePackagesQ = useQuery({
    queryKey: ['dash-my-homepackages'],
    queryFn: () => getHomePackages({ posted_by: 'me' }),
  })
  const examsQ = useQuery({ queryKey: ['dash-upcoming-exams'], queryFn: () => getExams() })
  const myClassQ = useQuery({
    queryKey: ['dash-my-class'],
    queryFn: getMyClass,
    enabled: role === 'CLASS_TEACHER',
    retry: false,
  })
  const disciplineQ = useQuery({
    queryKey: ['dash-discipline-open'],
    queryFn: () => getDisciplinaryIncidents({ status: 'OPEN' }),
    enabled: role === 'DISCIPLINE_TEACHER',
  })

  const allMyEntries = timetableQ.data?.results ?? []
  const todaysEntries = allMyEntries
    .filter((e) => e.day_of_week === todayCode())
    .sort((a, b) => a.period_order - b.period_order)

  const periodsById = Object.fromEntries(
    (periodsQ.data?.results ?? []).map((p) => [p.id, p])
  )

  const homePackages = (homePackagesQ.data?.results ?? [])
    .slice()
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcomingExams = (examsQ.data?.results ?? [])
    .filter((e) => new Date(e.end_date) >= today)
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
    .slice(0, 5)

  const openIncidents = disciplineQ.data?.results ?? []

  // ── Fourth stat card, role-dependent ──
  let fourthCard
  if (role === 'CLASS_TEACHER') {
    fourthCard = {
      title: 'My Class',
      value: myClassQ.data ? classLabel(myClassQ.data.level, myClassQ.data.stream) : '—',
      subtitle: myClassQ.data?.year_label ? `Year ${myClassQ.data.year_label}` : 'No active assignment',
      icon: Users,
      color: 'bg-secondary',
      loading: myClassQ.isLoading,
    }
  } else if (role === 'DISCIPLINE_TEACHER') {
    fourthCard = {
      title: 'Open Discipline Cases',
      value: String(disciplineQ.data?.count ?? openIncidents.length),
      subtitle: 'Reported by you',
      icon: ShieldAlert,
      color: 'bg-danger',
      loading: disciplineQ.isLoading,
    }
  } else {
    fourthCard = {
      title: "This Week's Lessons",
      value: String(allMyEntries.length),
      subtitle: 'Across all classes',
      icon: Users,
      color: 'bg-secondary',
      loading: timetableQ.isLoading,
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          Welcome{user?.full_name ? `, ${user.full_name}` : ''}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString('en-TZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {timetableQ.isLoading ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <Skeleton className="h-3 w-24 mb-3" />
            <Skeleton className="h-7 w-16 mb-2" />
            <Skeleton className="h-3 w-20" />
          </div>
        ) : (
          <StatCard
            title="Today's Lessons"
            value={String(todaysEntries.length)}
            icon={CalendarClock}
            color="bg-primary"
            subtitle={
              todaysEntries.length
                ? `Next: ${todaysEntries[0].period_name} — ${todaysEntries[0].subject_name ?? 'Free'}`
                : 'No lessons today'
            }
          />
        )}

        {homePackagesQ.isLoading ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <Skeleton className="h-3 w-24 mb-3" />
            <Skeleton className="h-7 w-16 mb-2" />
            <Skeleton className="h-3 w-20" />
          </div>
        ) : (
          <StatCard
            title="Home Packages Posted"
            value={String(homePackagesQ.data?.count ?? homePackages.length)}
            icon={BookOpen}
            color="bg-success"
            subtitle="By you"
          />
        )}

        {examsQ.isLoading ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <Skeleton className="h-3 w-24 mb-3" />
            <Skeleton className="h-7 w-16 mb-2" />
            <Skeleton className="h-3 w-20" />
          </div>
        ) : (
          <StatCard
            title="Upcoming Exams"
            value={String(upcomingExams.length)}
            icon={ClipboardList}
            color="bg-accent"
            subtitle={upcomingExams[0] ? `Next: ${upcomingExams[0].name}` : 'None scheduled'}
          />
        )}

        {fourthCard.loading ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <Skeleton className="h-3 w-24 mb-3" />
            <Skeleton className="h-7 w-16 mb-2" />
            <Skeleton className="h-3 w-20" />
          </div>
        ) : (
          <StatCard
            title={fourthCard.title}
            value={fourthCard.value}
            icon={fourthCard.icon}
            color={fourthCard.color}
            subtitle={fourthCard.subtitle}
          />
        )}
      </div>

      {/* ── Today's timetable + upcoming exams ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Today's Timetable</h2>
            <Link to="/timetable" className="text-xs text-primary hover:underline">
              View full timetable
            </Link>
          </div>

          {timetableQ.isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : todaysEntries.length === 0 ? (
            <EmptyState icon={CalendarClock} message="No lessons scheduled for today." />
          ) : (
            <div className="space-y-2">
              {todaysEntries.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-gray-50/70"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {e.subject_name ?? 'Free period'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {classLabel(e.level, e.stream)}{e.room ? ` · Room ${e.room}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-gray-600">{e.period_name}</p>
                    <p className="text-xs text-gray-400">
                      {fmtTime(periodsById[e.period]?.start_time)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Upcoming Exams</h2>
            <Link to="/exams" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>

          {examsQ.isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : upcomingExams.length === 0 ? (
            <EmptyState icon={ClipboardList} message="No upcoming exams scheduled." />
          ) : (
            <div className="space-y-2">
              {upcomingExams.map((exam) => (
                <div key={exam.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-gray-50/70">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{exam.name}</p>
                    <p className="text-xs text-gray-400">
                      {classLabel(exam.level, exam.stream)} · {exam.exam_type}
                    </p>
                  </div>
                  <div className="text-right shrink-0 text-xs text-gray-500">
                    {fmtDate(exam.start_date)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Home packages + discipline (role-dependent) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">My Home Packages</h2>
            <Link to="/homepackages" className="text-xs text-primary hover:underline">
              Manage
            </Link>
          </div>

          {homePackagesQ.isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : homePackages.length === 0 ? (
            <EmptyState icon={BookOpen} message="You haven't posted any home packages yet." />
          ) : (
            <div className="space-y-2">
              {homePackages.slice(0, 5).map((pkg) => (
                <div key={pkg.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-gray-50/70">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{pkg.title}</p>
                    <p className="text-xs text-gray-400">
                      {pkg.subject_code} · {classLabel(pkg.level, pkg.stream)}
                    </p>
                  </div>
                  <div className="text-right shrink-0 text-xs text-gray-500">
                    Due {fmtDate(pkg.due_date)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {role === 'DISCIPLINE_TEACHER' ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Open Discipline Cases</h2>
            </div>

            {disciplineQ.isLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : openIncidents.length === 0 ? (
              <EmptyState icon={ShieldAlert} message="No open cases — nice and quiet." />
            ) : (
              <div className="space-y-2">
                {openIncidents.slice(0, 5).map((inc) => (
                  <Link
                    key={inc.id}
                    to={`/students/${inc.student_public_id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-gray-50/70 hover:bg-gray-100 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{inc.student_name}</p>
                      <p className="text-xs text-gray-400">{inc.incident_type} · {fmtDate(inc.date)}</p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${
                        inc.severity === 'MAJOR'
                          ? 'bg-red-100 text-red-700'
                          : inc.severity === 'MODERATE'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {inc.severity}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Quick Links</h2>
            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/students"
                className="px-4 py-3 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
              >
                Students
              </Link>
              <Link
                to="/exams"
                className="px-4 py-3 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
              >
                Exams &amp; Marks
              </Link>
              <Link
                to="/homepackages"
                className="px-4 py-3 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
              >
                Home Packages
              </Link>
              <Link
                to="/timetable"
                className="px-4 py-3 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
              >
                Timetable
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
