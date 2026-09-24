import { useQuery } from '@tanstack/react-query'
import { getStreams } from '../api/students'

/** The school's managed stream names, e.g. ['A', 'B', 'BLUE']. */
export function useStreams() {
  const { data, isLoading } = useQuery({
    queryKey: ['streams'],
    queryFn: getStreams,
    staleTime: 5 * 60 * 1000,   // the list rarely changes
  })
  return { streams: (data ?? []).map((s) => s.name), isLoading }
}
