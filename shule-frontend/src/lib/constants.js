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
