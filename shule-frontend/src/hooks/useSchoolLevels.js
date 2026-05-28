import { useQuery } from '@tanstack/react-query'
import { getSchoolConfig } from '../api/config'
import { LEVEL_OPTIONS } from '../lib/constants'

export const ALL_LEVEL_GROUPS = [
  { value: 'PRIMARY', label: 'Standard 1 – 7' },
  { value: 'OLEVEL',  label: 'O-Level (Form 1 – 4)' },
  { value: 'ALEVEL',  label: 'A-Level (Form 5 – 6)' },
]

// Which individual levels belong to each group
const GROUP_LEVELS = {
  PRIMARY: ['STD1', 'STD2', 'STD3', 'STD4', 'STD5', 'STD6', 'STD7'],
  OLEVEL:  ['FORM1', 'FORM2', 'FORM3', 'FORM4'],
  ALEVEL:  ['FORM5', 'FORM6'],
}

/**
 * Returns level groups and individual level options filtered to what the
 * school has configured as active. Falls back to all levels if settings
 * haven't loaded yet or active_levels is empty.
 */
export function useSchoolLevels() {
  const { data, isLoading } = useQuery({
    queryKey: ['school-config'],
    queryFn: getSchoolConfig,
    staleTime: 5 * 60 * 1000,   // cache for 5 min — settings rarely change
  })

  const active = data?.active_levels ?? []
  const hasFilter = active.length > 0

  const levelGroups = hasFilter
    ? ALL_LEVEL_GROUPS.filter(g => active.includes(g.value))
    : ALL_LEVEL_GROUPS

  const allowedValues = hasFilter
    ? active.flatMap(g => GROUP_LEVELS[g] ?? [])
    : null  // null = no filter, show all

  const levelOptions = allowedValues
    ? LEVEL_OPTIONS.filter(o => allowedValues.includes(o.value))
    : LEVEL_OPTIONS

  return { levelGroups, levelOptions, isLoading }
}
