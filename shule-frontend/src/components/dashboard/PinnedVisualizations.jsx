import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, EyeOff, PinOff } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  getAnalyticsDimensions, listVisualizations, runAnalyticsQuery, unpinVisualization,
} from '../../api/analytics'
import { FEATURE_ROLES } from '../../lib/constants'
import { buildChartModel } from '../../pages/analytics/charts'
import ChartView from '../../pages/analytics/components/ChartView'
import PivotTable from '../../pages/analytics/components/PivotTable'
import { buildPivot } from '../../pages/analytics/pivot'
import {
  PINNED_KEY, VISUALIZATIONS_KEY, catalogueItemLabels, makeLabelFor, unavailableMessage,
} from '../../pages/analytics/savedVisualizations'
import {
  FIXED_DIMENSION_LABELS, buildQuery, configReducer, initialConfig, isChart, layoutProblem,
} from '../../pages/analytics/visualizationConfig'
import Card from '../ui/Card'

function Placeholder({ icon: Icon = AlertTriangle, title, message }) {
  return (
    <div className="flex flex-col items-center justify-center text-center h-48 px-4 rounded-lg bg-gray-50">
      <Icon size={24} className="text-gray-300 mb-2" />
      <p className="text-sm font-medium text-gray-600">{title}</p>
      {message && <p className="text-xs text-gray-500 mt-1 max-w-sm">{message}</p>}
    </div>
  )
}

function WidgetBody({ viz }) {
  const config = useMemo(() => configReducer(initialConfig, { type: 'LOAD', config: viz.config }), [viz.config])
  const problem = unavailableMessage(viz.unavailable)

  const catalogue = useQuery({
    queryKey: ['analytics', 'dimensions'],
    queryFn: getAnalyticsDimensions,
    staleTime: 5 * 60 * 1000,
    enabled: !problem,
  })
  const dimensions = catalogue.data?.dimensions
  const dimensionsById = useMemo(() => Object.fromEntries((dimensions ?? []).map((d) => [d.id, d])), [dimensions])
  const dimensionLabel = (id) => FIXED_DIMENSION_LABELS[id] ?? dimensionsById[id]?.label ?? id

  const query = catalogue.data && !problem ? buildQuery(config, dimensionsById) : null
  const layoutIssue = catalogue.data && !problem ? layoutProblem(config, dimensionLabel) : null
  const params = query?.params?.toString()

  const result = useQuery({
    // The same key as the analytics page, so both share cached results.
    queryKey: ['analytics', 'query', params],
    queryFn: () => runAnalyticsQuery(new URLSearchParams(params)),
    enabled: Boolean(params) && !layoutIssue,
    retry: false,
    staleTime: 60 * 1000,
  })

  const itemLabels = useMemo(() => catalogueItemLabels(dimensions), [dimensions])
  const pivot = useMemo(() => {
    if (!result.data) return null
    return buildPivot(result.data, config, config.options, makeLabelFor(itemLabels, result.data))
  }, [result.data, config, itemLabels])
  const chartModel = useMemo(() => {
    if (!pivot || pivot.isEmpty || !isChart(config.type)) return null
    return buildChartModel(pivot, config.type, config.options)
  }, [pivot, config])

  if (problem) {
    return <Placeholder icon={EyeOff} title="Not available" message={problem} />
  }
  if (catalogue.isError || result.isError) {
    return <Placeholder title="Could not load this visualization" message="Open it in Analytics to see what went wrong." />
  }
  if (query?.error || layoutIssue) {
    return <Placeholder title="Needs attention" message={query?.error ?? layoutIssue.message} />
  }
  if (!pivot) {
    return <div className="h-48 rounded-lg bg-gray-100 animate-pulse" />
  }
  if (pivot.isEmpty) {
    return <Placeholder title="No data" message="Nothing was recorded for this selection yet." />
  }
  if (chartModel) {
    if (chartModel.tooMany) {
      return <Placeholder title="Too many series to draw here" message="Open it in Analytics to view it as a table." />
    }
    return <ChartView model={chartModel} options={config.options} />
  }
  return (
    <div className="max-h-80 overflow-auto">
      <PivotTable pivot={pivot} options={config.options} dimensionLabel={dimensionLabel} />
    </div>
  )
}

function VisualizationWidget({ viz, onUnpin }) {
  return (
    <Card>
      <div className="flex items-start gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-700 truncate">{viz.name}</h2>
          {viz.description && <p className="text-xs text-gray-400 truncate">{viz.description}</p>}
        </div>
        <Link to={`/analytics?viz=${viz.id}`} title="Open in Analytics" aria-label={`Open ${viz.name} in Analytics`}
          className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <ExternalLink size={14} />
        </Link>
        <button type="button" onClick={() => onUnpin(viz)} title="Unpin from dashboard"
          aria-label={`Unpin ${viz.name}`} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <PinOff size={14} />
        </button>
      </div>
      <WidgetBody viz={viz} />
    </Card>
  )
}

/**
 * The saved analytics visualizations the user pinned, drawn as dashboard
 * widgets. Renders nothing without the analytics module, for roles outside
 * analytics, or when nothing is pinned.
 */
export default function PinnedVisualizations({ role, enabledModules }) {
  const queryClient = useQueryClient()
  const show = enabledModules.includes('analytics') && FEATURE_ROLES.ANALYTICS.includes(role)
  const pinned = useQuery({
    queryKey: PINNED_KEY,
    queryFn: () => listVisualizations({ pinned: 'true' }),
    enabled: show,
  })

  async function unpin(viz) {
    try {
      await unpinVisualization(viz.id)
      queryClient.invalidateQueries({ queryKey: VISUALIZATIONS_KEY })
    } catch {
      toast.error('Could not unpin. Try again.')
    }
  }

  if (!show || !pinned.data?.length) return null
  return (
    <section aria-label="Pinned visualizations" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {pinned.data.map((viz) => <VisualizationWidget key={viz.id} viz={viz} onUnpin={unpin} />)}
    </section>
  )
}
