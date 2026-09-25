import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, ChartColumn, Download, PanelLeft, RefreshCw, SlidersHorizontal, Table2, Wand2, X,
} from 'lucide-react'
import { useCallback, useMemo, useReducer, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { getAnalyticsDimensions, runAnalyticsQuery } from '../../api/analytics'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import { selectCls } from '../../lib/formStyles'
import { buildChartModel } from './charts'
import ChartView from './components/ChartView'
import DimensionModal from './components/DimensionModal'
import DimensionPanel from './components/DimensionPanel'
import LayoutArea from './components/LayoutArea'
import OptionsModal from './components/OptionsModal'
import PivotTable from './components/PivotTable'
import { downloadChartPng, downloadCsv, downloadFilename, downloadXlsx, pivotGrid } from './download'
import { buildPivot } from './pivot'
import {
  FIXED_DIMENSION_LABELS, VISUALIZATION_TYPES, axisLabels, buildQuery, configReducer, flattenTree,
  initialConfig, isChart, layoutProblem, periodLabel, placementError,
} from './visualizationConfig'

function errorMessage(err) {
  const data = err?.response?.data
  if (data?.detail) return data.detail
  if (err?.response?.status === 403) return 'You do not have access to this data.'
  return 'The analytics service could not be reached. Try again.'
}

function Spinner() {
  return <div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
}

export default function AnalyticsPage() {
  const [config, dispatch] = useReducer(configReducer, initialConfig)
  // The config the table on screen was produced from: layout edits don't
  // reshape the table until Update runs them.
  const [applied, setApplied] = useState(null)
  const [validationError, setValidationError] = useState(null)
  const [modalDimId, setModalDimId] = useState(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const chartRef = useRef(null)

  const catalogue = useQuery({
    queryKey: ['analytics', 'dimensions'],
    queryFn: getAnalyticsDimensions,
    staleTime: 5 * 60 * 1000,
  })
  const dimensions = useMemo(() => catalogue.data?.dimensions ?? [], [catalogue.data])
  const dimensionsById = useMemo(() => Object.fromEntries(dimensions.map((d) => [d.id, d])), [dimensions])

  const result = useQuery({
    queryKey: ['analytics', 'query', applied?.params],
    queryFn: () => runAnalyticsQuery(new URLSearchParams(applied.params)),
    enabled: Boolean(applied),
    retry: false,
    staleTime: 60 * 1000,
  })

  const dimensionLabel = useCallback(
    (id) => FIXED_DIMENSION_LABELS[id] ?? dimensionsById[id]?.label ?? id,
    [dimensionsById],
  )

  // Catalogue item labels per dimension: the fallback for an item the
  // response doesn't name.
  const itemLabels = useMemo(() => {
    const out = {}
    for (const d of dimensions) {
      const list = d.kind === 'org_unit' ? flattenTree(d.items) : d.items ?? []
      out[d.id] = Object.fromEntries(list.map((i) => [i.id, i.label]))
    }
    return out
  }, [dimensions])

  const labelFor = useCallback((dimId, itemId) => {
    // The response names items per dimension (ids repeat across dimensions:
    // grade F, gender F).
    const name = result.data?.metaData?.items?.[dimId]?.items?.[itemId]?.name
    if (name) return name
    if (dimId === 'pe') return itemLabels.pe?.[itemId] ?? periodLabel(itemId)
    return itemLabels[dimId]?.[itemId] ?? (itemId || '(blank)')
  }, [itemLabels, result.data])

  const pivot = useMemo(() => {
    if (!result.data || !applied) return null
    return buildPivot(result.data, applied.config, config.options, labelFor)
  }, [result.data, applied, config.options, labelFor])

  // Grey out dimensions that don't apply to every chosen metric.
  const metricsById = useMemo(
    () => Object.fromEntries((dimensionsById.dx?.items ?? []).map((m) => [m.id, m])),
    [dimensionsById],
  )
  const notApplicable = useCallback((dim) => {
    if (dim.kind !== 'dynamic') return null
    const missing = (config.items.dx ?? [])
      .map((id) => metricsById[id])
      .filter((m) => m && !dim.applies_to.includes(m.source))
    return missing.length ? `Does not apply to: ${missing.map((m) => m.label).join(', ')}` : null
  }, [config.items.dx, metricsById])

  const appliedType = applied?.config.type
  const chartModel = useMemo(() => {
    if (!pivot || pivot.isEmpty || !isChart(appliedType)) return null
    return buildChartModel(pivot, appliedType, config.options)
  }, [pivot, appliedType, config.options])

  function run(cfg) {
    // The layout banner already explains what's wrong and offers the fix.
    if (layoutProblem(cfg, dimensionLabel)) return
    const { params, error } = buildQuery(cfg, dimensionsById)
    if (error) {
      setValidationError(error)
      return
    }
    setValidationError(null)
    const paramString = params.toString()
    if (applied?.params === paramString) result.refetch()
    setApplied({ config: cfg, params: paramString })
  }

  function load(cfg) {
    dispatch({ type: 'LOAD', config: cfg })
    run(cfg)
  }

  // Switching type redraws the current result straight away when the new type
  // can draw it from the same query.
  function changeType(visType) {
    const next = configReducer(config, { type: 'SET_TYPE', visType })
    dispatch({ type: 'SET_TYPE', visType })
    if (applied && !layoutProblem(next, dimensionLabel)
      && buildQuery(next, dimensionsById).params?.toString() === applied.params) {
      setApplied({ config: next, params: applied.params })
    }
  }

  function place(dimId, axis, index) {
    const error = placementError(dimensionsById[dimId], axis)
    if (error) {
      setValidationError(error)
      return
    }
    dispatch({ type: 'MOVE_DIMENSION', dimId, axis, index })
  }

  function openDimension(dimId) {
    setDrawerOpen(false)
    setModalDimId(dimId)
  }

  const current = buildQuery(config, dimensionsById)
  const stale = applied && current.params
    && (current.params.toString() !== applied.params || config.type !== applied.config.type)
  const problem = layoutProblem(config, dimensionLabel)

  const modalDim = modalDimId && dimensionsById[modalDimId]
  const modalAxis = modalDim && ['columns', 'rows', 'filters'].find((a) => config[a].includes(modalDimId))

  const panel = catalogue.isLoading ? (
    <div className="flex justify-center py-10"><Spinner /></div>
  ) : catalogue.isError ? (
    <p className="p-4 text-sm text-danger">{errorMessage(catalogue.error)}</p>
  ) : (
    <DimensionPanel dimensions={dimensions} config={config} dimensionLabel={dimensionLabel}
      notApplicable={notApplicable} onOpen={openDimension} />
  )

  const filterSummary = applied?.config.filters
    .filter((id) => applied.config.items[id]?.length)
    .map((id) => `${dimensionLabel(id)}: ${applied.config.items[id].map((i) => labelFor(id, i)).join(', ')}`)
  const subtitle = filterSummary?.join(' · ')

  const canDownload = Boolean(pivot && !pivot.isEmpty && !result.isError)
  const canDownloadPng = Boolean(canDownload && chartModel && !chartModel.tooMany)

  async function download(format) {
    setDownloadOpen(false)
    const filename = downloadFilename()
    if (format === 'png') {
      const svg = chartRef.current?.querySelector('svg')
      if (!svg) return
      const single = appliedType === 'SINGLE_VALUE'
      const series = chartModel.series ?? []
      try {
        await downloadChartPng(svg, {
          // A single value's SVG carries its own heading.
          title: single ? null : applied.config.items.dx.map((i) => labelFor('dx', i)).join(', '),
          subtitle: single ? null : subtitle,
          legend: series.length >= 2 || appliedType === 'PIE' ? series.filter((s) => s.name) : [],
          filename,
        })
      } catch (err) {
        toast.error(err.message)
      }
      return
    }
    const grid = pivotGrid(pivot, dimensionLabel)
    if (format === 'csv') downloadCsv(grid, filename)
    else downloadXlsx(grid, filename)
  }

  let body
  if (!applied) {
    body = (
      <EmptyState icon={Table2} title="Build a visualization"
        message="Choose data, periods and classes from the dimensions panel, arrange them on the layout, then click Update." />
    )
  } else if (result.isFetching && !pivot) {
    body = <div className="flex justify-center py-16"><Spinner /></div>
  } else if (result.isError) {
    body = (
      <div className="flex flex-col items-center py-16 px-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-3">
          <AlertTriangle size={24} className="text-danger" />
        </div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">The visualization could not be built</h3>
        <p className="text-sm text-gray-500 max-w-md">{errorMessage(result.error)}</p>
        <Button variant="outline" size="sm" icon={RefreshCw} className="mt-4" onClick={() => result.refetch()}>
          Try again
        </Button>
      </div>
    )
  } else if (pivot?.isEmpty) {
    body = <EmptyState title="No data" message="Nothing was recorded for this selection. Try other periods or classes." />
  } else if (pivot) {
    body = (
      <div className={`space-y-3 transition-opacity ${result.isFetching ? 'opacity-50' : ''}`}>
        {subtitle && appliedType !== 'SINGLE_VALUE' && <p className="text-xs text-gray-500">{subtitle}</p>}
        {chartModel ? (
          <ChartView ref={chartRef} model={chartModel} options={config.options} subtitle={subtitle}
            // Only needed (and only passed) when the chart isn't drawn, so the
            // memoised chart otherwise keeps stable props.
            onSwapAxes={chartModel.tooMany
              ? () => load({ ...applied.config, columns: applied.config.rows, rows: applied.config.columns })
              : undefined} />
        ) : (
          <PivotTable pivot={pivot} options={config.options} dimensionLabel={dimensionLabel} />
        )}
        {pivot.hasSuppressed && (
          <p className="text-xs text-gray-400">* Hidden to protect privacy: too few pupils in the cell.</p>
        )}
      </div>
    )
  }

  const warnings = result.data?.metaData?.warnings ?? []

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-6.5rem)] min-h-0">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 bg-white rounded-xl border border-gray-100 shadow-card px-3 py-2">
        <Button variant="outline" size="sm" icon={PanelLeft} className="lg:hidden" onClick={() => setDrawerOpen(true)}>
          Dimensions
        </Button>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <ChartColumn size={16} className="text-gray-400" />
          <span className="sr-only">Visualization type</span>
          <select value={config.type} onChange={(e) => changeType(e.target.value)}
            className={`${selectCls} py-1.5`}>
            {VISUALIZATION_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <div className="flex-1" />
        {stale && <span className="hidden sm:inline text-xs text-amber-600">Layout changed</span>}
        <Button variant="outline" size="sm" icon={SlidersHorizontal} onClick={() => setOptionsOpen(true)}>
          Options
        </Button>
        <div className="relative">
          <Button variant="outline" size="sm" icon={Download} disabled={!canDownload}
            aria-haspopup="menu" aria-expanded={downloadOpen} onClick={() => setDownloadOpen((o) => !o)}>
            Download
          </Button>
          {downloadOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setDownloadOpen(false)} />
              <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-48 rounded-lg border border-gray-200 bg-white shadow-card py-1 text-sm text-gray-700">
                <p className="px-3 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Table</p>
                <button type="button" role="menuitem" onClick={() => download('csv')}
                  className="block w-full text-left px-3 py-1.5 hover:bg-gray-50">CSV (.csv)</button>
                <button type="button" role="menuitem" onClick={() => download('xlsx')}
                  className="block w-full text-left px-3 py-1.5 hover:bg-gray-50">Excel (.xlsx)</button>
                <p className="px-3 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Chart</p>
                <button type="button" role="menuitem" onClick={() => download('png')} disabled={!canDownloadPng}
                  title={canDownloadPng ? undefined : 'Switch to a chart type to download an image'}
                  className="block w-full text-left px-3 py-1.5 hover:bg-gray-50 disabled:text-gray-300 disabled:hover:bg-transparent">
                  Image (.png)
                </button>
              </div>
            </>
          )}
        </div>
        <Button size="sm" icon={RefreshCw} onClick={() => run(config)} disabled={catalogue.isLoading || catalogue.isError}>
          Update
        </Button>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Desktop dimension panel */}
        <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-white rounded-xl border border-gray-100 shadow-card min-h-0">
          {panel}
        </aside>

        <div className="flex flex-col gap-3 flex-1 min-w-0 min-h-0">
          <LayoutArea config={config} dimensionsById={dimensionsById} dimensionLabel={dimensionLabel}
            onOpen={openDimension} onPlace={place}
            onRemove={(dimId) => dispatch({ type: 'REMOVE_DIMENSION', dimId })} />

          {problem && (
            <div className="flex flex-wrap items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span className="flex-1 min-w-[12rem]">
                {problem.message} <span className="text-amber-700">Auto-fix will {problem.fixDescription}.</span>
              </span>
              <Button variant="outline" size="sm" icon={Wand2} className="bg-white" onClick={() => load(problem.fixed)}>
                Fix layout
              </Button>
            </div>
          )}
          {validationError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span className="flex-1">{validationError}</span>
              <button type="button" onClick={() => setValidationError(null)} aria-label="Dismiss"><X size={14} /></button>
            </div>
          )}
          {warnings.length > 0 && !result.isError && (
            <ul className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-0.5">
              {warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}

          <section className="flex-1 min-h-0 overflow-auto bg-white rounded-xl border border-gray-100 shadow-card p-3 sm:p-4">
            {body}
          </section>
        </div>
      </div>

      {/* Mobile dimension drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex flex-col w-72 max-w-[85vw] bg-white shadow-xl">
            <div className="flex items-center justify-between px-3 h-12 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-800">Dimensions</span>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close"
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0">{panel}</div>
          </div>
        </div>
      )}

      {modalDim && (
        <DimensionModal
          key={modalDim.id}
          dim={modalDim}
          title={dimensionLabel(modalDim.id)}
          groups={catalogue.data?.groups ?? []}
          selected={config.items[modalDim.id] ?? []}
          axis={modalAxis}
          axisNames={axisLabels(config.type)}
          onClose={() => setModalDimId(null)}
          onApply={(items, andRun) => {
            const action = { type: 'SET_ITEMS', dimId: modalDim.id, items }
            dispatch(action)
            setModalDimId(null)
            if (andRun) run(configReducer(config, action))
          }}
          onAddTo={(axis, items) => {
            dispatch({ type: 'SET_ITEMS', dimId: modalDim.id, items })
            dispatch({ type: 'MOVE_DIMENSION', dimId: modalDim.id, axis })
            setModalDimId(null)
          }}
        />
      )}

      {optionsOpen && (
        <OptionsModal
          type={config.type}
          options={config.options}
          onClose={() => setOptionsOpen(false)}
          onApply={(options) => {
            dispatch({ type: 'SET_OPTIONS', options })
            setOptionsOpen(false)
          }}
        />
      )}
    </div>
  )
}
