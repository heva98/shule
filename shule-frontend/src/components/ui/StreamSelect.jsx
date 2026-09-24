import { useStreams } from '../../hooks/useStreams'

/**
 * Drop-in replacement for a stream text input: a <select> over the managed
 * stream list. Works with react-hook-form (`{...register('stream')}`) or as
 * a controlled input (`value` + `onChange`). A current value that is no
 * longer in the list is still shown so editing a record doesn't blank it.
 */
export default function StreamSelect({ value, emptyLabel = '— None —', className = '', ref, ...props }) {
  const { streams } = useStreams()
  const options = value && !streams.includes(value) ? [...streams, value] : streams
  const valueProps = value === undefined ? {} : { value }
  return (
    <select ref={ref} {...valueProps} {...props} className={className}>
      <option value="">{emptyLabel}</option>
      {options.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  )
}
