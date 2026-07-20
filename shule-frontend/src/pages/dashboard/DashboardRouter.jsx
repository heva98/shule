import { useAuth } from '../../context/AuthContext'
import DashboardPage from './DashboardPage'
import TeacherDashboard from './TeacherDashboard'

const TEACHING_ROLES = [
  'TEACHER', 'ACADEMIC_TEACHER', 'DISCIPLINE_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER',
]

// Fee/revenue overview is for OWNER, HEADTEACHER, BURSAR — teaching roles get
// a dashboard built around their own classes instead.
export default function DashboardRouter() {
  const { user } = useAuth()
  return TEACHING_ROLES.includes(user?.role) ? <TeacherDashboard /> : <DashboardPage />
}
