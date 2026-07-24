export const LEVEL_OPTIONS = [
  { value: 'STD1', label: 'Standard 1' },
  { value: 'STD2', label: 'Standard 2' },
  { value: 'STD3', label: 'Standard 3' },
  { value: 'STD4', label: 'Standard 4' },
  { value: 'STD5', label: 'Standard 5' },
  { value: 'STD6', label: 'Standard 6' },
  { value: 'STD7', label: 'Standard 7' },
  { value: 'FORM1', label: 'Form 1' },
  { value: 'FORM2', label: 'Form 2' },
  { value: 'FORM3', label: 'Form 3' },
  { value: 'FORM4', label: 'Form 4' },
  { value: 'FORM5', label: 'Form 5' },
  { value: 'FORM6', label: 'Form 6' },
]

export const STATUS_OPTIONS = [
  { value: 'ACTIVE',      label: 'Active' },
  { value: 'TRANSFERRED', label: 'Transferred' },
  { value: 'GRADUATED',   label: 'Graduated' },
  { value: 'SUSPENDED',   label: 'Suspended' },
  { value: 'EXPELLED',    label: 'Expelled' },
]

export const GENDER_OPTIONS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
]

export const RELATIONSHIP_OPTIONS = [
  { value: 'FATHER',   label: 'Father' },
  { value: 'MOTHER',   label: 'Mother' },
  { value: 'GUARDIAN', label: 'Guardian' },
  { value: 'OTHER',    label: 'Other' },
]

export const LEVEL_LABEL = Object.fromEntries(
  LEVEL_OPTIONS.map((o) => [o.value, o.label])
)

export const STATUS_BADGE = {
  ACTIVE:      'bg-green-100 text-green-700',
  SUSPENDED:   'bg-yellow-100 text-yellow-700',
  EXPELLED:    'bg-red-100 text-red-700',
  TRANSFERRED: 'bg-blue-100 text-blue-700',
  GRADUATED:   'bg-purple-100 text-purple-700',
}

export const INVOICE_BADGE = {
  PAID:    'bg-green-100 text-green-700',
  PARTIAL: 'bg-yellow-100 text-yellow-700',
  UNPAID:  'bg-red-100 text-red-700',
  OVERDUE: 'bg-red-200 text-red-800',
}

export const ATT_BADGE = {
  PRESENT: 'bg-green-100 text-green-700',
  ABSENT:  'bg-red-100 text-red-700',
  LATE:    'bg-yellow-100 text-yellow-700',
  EXCUSED: 'bg-blue-100 text-blue-700',
}

export const GRADE_BADGE = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-yellow-100 text-yellow-700',
  D: 'bg-orange-100 text-orange-700',
  F: 'bg-red-100 text-red-700',
}

// ── Roles ────────────────────────────────────────────────────────────────────
// Single source of truth for role metadata — previously redefined independently
// in AddUserModal, RoleAssignmentPage, UserManagementPage, Sidebar and App.jsx,
// which let them drift (e.g. Sidebar's label map never got WARDEN/LIBRARIAN
// added when those roles were introduced).

export const ROLE_OPTIONS = [
  { value: 'OWNER',              label: 'Owner',              desc: 'Full system access',                color: 'border-purple-300 text-purple-700' },
  { value: 'SYSTEM_ADMIN',       label: 'System Admin',       desc: 'System configuration & users',      color: 'border-red-300 text-red-700' },
  { value: 'HEADTEACHER',        label: 'Headteacher',        desc: 'School administration & oversight', color: 'border-blue-900/40 text-blue-900' },
  { value: 'ACADEMIC_TEACHER',   label: 'Academic Teacher',   desc: 'Academic coordination',              color: 'border-orange-300 text-orange-700' },
  { value: 'DISCIPLINE_TEACHER', label: 'Discipline Teacher', desc: 'Disciplinary management',           color: 'border-purple-300 text-purple-600' },
  { value: 'CLASS_TEACHER',      label: 'Class Teacher',      desc: 'Class register & marks',            color: 'border-green-300 text-green-700' },
  { value: 'SUBJECT_TEACHER',    label: 'Subject Teacher',    desc: 'Mark entry for subjects',           color: 'border-teal-300 text-teal-700' },
  { value: 'TEACHER',            label: 'Teacher',            desc: 'General (legacy role)',             color: 'border-sky-300 text-sky-700' },
  { value: 'BURSAR',             label: 'Bursar',             desc: 'Fees & finance management',         color: 'border-yellow-300 text-yellow-700' },
  { value: 'WARDEN',             label: 'Warden',             desc: 'Dormitories & boarding',             color: 'border-indigo-300 text-indigo-700' },
  { value: 'LIBRARIAN',          label: 'Librarian',          desc: 'Library catalog & loans',           color: 'border-cyan-300 text-cyan-700' },
  { value: 'PARENT',             label: 'Parent',             desc: 'View children\'s records',          color: 'border-gray-300 text-gray-600' },
]

// Roles that exist on accounts but aren't assignable through the Add User /
// Change Role forms (students get accounts through a separate flow).
export const ROLE_LABEL = {
  ...Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.label])),
  STUDENT: 'Student',
}

export const ROLE_BADGE = {
  OWNER:              'bg-purple-100 text-purple-700',
  SYSTEM_ADMIN:       'bg-red-100 text-red-700',
  HEADTEACHER:        'bg-[#1B4F72]/10 text-[#1B4F72]',
  ACADEMIC_TEACHER:   'bg-orange-100 text-orange-700',
  DISCIPLINE_TEACHER: 'bg-violet-100 text-violet-700',
  CLASS_TEACHER:      'bg-green-100 text-green-700',
  SUBJECT_TEACHER:    'bg-teal-100 text-teal-700',
  TEACHER:            'bg-sky-100 text-sky-700',
  BURSAR:             'bg-yellow-100 text-yellow-700',
  WARDEN:             'bg-indigo-100 text-indigo-700',
  LIBRARIAN:          'bg-cyan-100 text-cyan-700',
  PARENT:             'bg-gray-100 text-gray-600',
  STUDENT:            'bg-blue-100 text-blue-700',
}

export const ROLE_ICON = {
  OWNER: '👑', SYSTEM_ADMIN: '🛡️', HEADTEACHER: '🏫',
  ACADEMIC_TEACHER: '📚', DISCIPLINE_TEACHER: '⚖️', CLASS_TEACHER: '📋',
  SUBJECT_TEACHER: '✏️', TEACHER: '👨‍🏫', BURSAR: '💰', WARDEN: '🛏️',
  LIBRARIAN: '📖', PARENT: '👪', STUDENT: '🎓',
}

// Where each role lands immediately after login.
export const ROLE_LANDING_PATH = {
  OWNER: '/dashboard',
  HEADTEACHER: '/dashboard',
  TEACHER: '/attendance',
  BURSAR: '/fees',
  WARDEN: '/boarding',
  LIBRARIAN: '/library',
  PARENT: '/parent',
  STUDENT: '/parent',
}

// Mirrors backend accounts.permissions.SENIOR_STAFF_ROLES / CONTENT_CREATOR_ROLES —
// used within feature pages to gate edit/create actions (as opposed to
// FEATURE_ROLES below, which gates access to the page itself). Previously
// redefined identically in HomePackagesPage, StudentDetailPage and TimetablePage.
export const SENIOR_STAFF_ROLES = ['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER']
export const CONTENT_CREATOR_ROLES = ['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'TEACHER']

// Per-feature access lists — the single source shared by route guards
// (App.jsx) and sidebar nav visibility (Sidebar.jsx) so the two can't drift
// apart (previously each kept its own copy of every list).
export const FEATURE_ROLES = {
  ADMIN:           ['OWNER', 'SYSTEM_ADMIN'],
  DASHBOARD:       ['OWNER', 'HEADTEACHER', 'BURSAR', 'TEACHER', 'ACADEMIC_TEACHER', 'DISCIPLINE_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER'],
  STUDENTS:        ['OWNER', 'HEADTEACHER', 'TEACHER', 'BURSAR', 'ACADEMIC_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'DISCIPLINE_TEACHER'],
  FEES:            ['OWNER', 'HEADTEACHER', 'BURSAR'],
  ATTENDANCE:      ['OWNER', 'HEADTEACHER', 'TEACHER', 'ACADEMIC_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'DISCIPLINE_TEACHER'],
  TIMETABLE:       ['OWNER', 'HEADTEACHER', 'TEACHER', 'ACADEMIC_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'DISCIPLINE_TEACHER'],
  BOARDING:        ['OWNER', 'HEADTEACHER', 'DISCIPLINE_TEACHER', 'WARDEN'],
  LIBRARY:         ['OWNER', 'HEADTEACHER', 'LIBRARIAN'],
  TRANSPORT:       ['OWNER', 'HEADTEACHER', 'BURSAR'],
  HOME_PACKAGES:   ['OWNER', 'HEADTEACHER', 'TEACHER', 'ACADEMIC_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'DISCIPLINE_TEACHER'],
  EXAMS:           ['OWNER', 'HEADTEACHER', 'TEACHER', 'ACADEMIC_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER'],
  STAFF:           ['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER'],
  COMMUNICATIONS:  ['OWNER', 'HEADTEACHER', 'ACADEMIC_TEACHER'],
  SCHOOL_CALENDAR: ['OWNER', 'SYSTEM_ADMIN', 'HEADTEACHER', 'ACADEMIC_TEACHER', 'DISCIPLINE_TEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'TEACHER', 'BURSAR'],
  PARENT:          ['PARENT'],
}
