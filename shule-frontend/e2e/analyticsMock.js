// A fake backend for the analytics page: /auth/me, the dimension catalogue
// and a query endpoint that answers any layout with predictable numbers.
import { test as base, expect } from '@playwright/test'

export const METRICS = [
  { id: 'exam.mean_score', label: 'Mean score', unit: 'percent', source: 'exam' },
  { id: 'exam.pass_rate', label: 'Pass rate', unit: 'percent', source: 'exam' },
]
export const PERIODS = [
  { id: 'THIS_TERM', label: 'This term', type: 'relative' },
  { id: 'LAST_TERM', label: 'Last term', type: 'relative' },
  { id: 'THIS_YEAR', label: 'This year', type: 'relative' },
]
export const CLASSES = Array.from({ length: 10 }, (_, i) => ({ id: `FORM${i + 1}`, label: `Form ${i + 1}` }))

const catalogue = {
  groups: [],
  dimensions: [
    { id: 'dx', label: 'Data', kind: 'data', items: METRICS },
    { id: 'pe', label: 'Period', kind: 'period', items: PERIODS },
    {
      id: 'ou', label: 'Org unit', kind: 'org_unit', items: [{
        id: 'SCHOOL', label: 'Whole school', level: 'school',
        children: CLASSES.map((c) => ({ ...c, level: 'level', children: [] })),
      }],
    },
    { id: 'gender', label: 'Gender', kind: 'dynamic', applies_to: ['exam'], items: [{ id: 'F', label: 'Female' }, { id: 'M', label: 'Male' }] },
  ],
}

const NAMES = {
  dx: Object.fromEntries(METRICS.map((m) => [m.id, { name: m.label, unit: m.unit }])),
  pe: Object.fromEntries(PERIODS.map((p) => [p.id, { name: p.label }])),
  ou: Object.fromEntries([['SCHOOL', { name: 'Whole school' }], ...CLASSES.map((c) => [c.id, { name: c.label }])]),
  gender: { F: { name: 'Female' }, M: { name: 'Male' } },
}
const ORDER = Object.fromEntries(Object.entries(NAMES).map(([dim, items]) => [dim, Object.keys(items)]))
const WEIGHT = { dx: 10, pe: 5, ou: 2, gender: 1 }

/**
 * The value the mock returns for a cell: 40 plus, for each dimension in the
 * query, the item's 1-based position times the dimension's weight. So Mean
 * score / This term = 40 + 10 + 5 = 55, Pass rate / This term = 65, Mean
 * score / Last term = 60.
 */
export function mockValue(items) {
  return 40 + Object.entries(items).reduce((sum, [dim, id]) => sum + (ORDER[dim].indexOf(id) + 1) * WEIGHT[dim], 0)
}

function queryResponse(url) {
  const dims = url.searchParams.getAll('dimension').map((d) => {
    const [id, list] = d.split(':')
    return { id, items: list ? list.split(';') : ORDER[id] }
  })
  let combos = [{}]
  for (const d of dims) combos = combos.flatMap((c) => d.items.map((i) => ({ ...c, [d.id]: i })))
  return {
    headers: [...dims.map((d) => ({ name: d.id, column: d.id, meta: true })), { name: 'value' }, { name: 'suppressed' }],
    rows: combos.map((c) => [...dims.map((d) => c[d.id]), mockValue(c), false]),
    metaData: {
      dimensions: Object.fromEntries(dims.map((d) => [d.id, d.items])),
      items: Object.fromEntries(dims.map((d) => [d.id, {
        name: d.id, items: Object.fromEntries(d.items.map((i) => [i, NAMES[d.id][i]])),
      }])),
      warnings: [],
    },
  }
}

/**
 * A saved visualization as the API returns it. `vizzes` in the backend is the
 * mock's store: tests seed it and read what the page saved.
 */
export function savedViz(overrides = {}) {
  return {
    id: 1, name: 'Mean score by term', description: '', type: 'PIVOT_TABLE', shared_with_staff: false,
    created_by: 1, created_by_name: 'Head Teacher', is_owner: true, is_pinned: false, unavailable: [],
    config: {
      version: 1, type: 'PIVOT_TABLE', columns: ['dx'], rows: ['pe'], filters: ['ou'],
      items: { dx: ['exam.mean_score'], pe: ['THIS_TERM', 'LAST_TERM'], ou: ['SCHOOL'] },
      options: {},
    },
    ...overrides,
  }
}

// /api/analytics/visualizations/[<id>/][pin/] against the in-memory store.
function visualizationsRoute(route, url, vizzes) {
  const [, id, pin] = /^\/api\/analytics\/visualizations\/(?:(\d+)\/)?(pin\/)?$/.exec(url.pathname) ?? []
  const method = route.request().method()
  const body = route.request().postDataJSON?.() ?? null
  const viz = id && vizzes.find((v) => v.id === Number(id))
  if (id && !viz) return route.fulfill({ status: 404, json: { detail: 'Not found.' } })

  if (pin) {
    viz.is_pinned = method === 'POST'
    return route.fulfill({ status: 204, body: '' })
  }
  if (!id && method === 'GET') {
    const pinnedOnly = url.searchParams.get('pinned') === 'true'
    return route.fulfill({ json: vizzes.filter((v) => !pinnedOnly || v.is_pinned) })
  }
  if (!id && method === 'POST') {
    const created = savedViz({
      ...body, id: Math.max(0, ...vizzes.map((v) => v.id)) + 1, type: body.config.type,
    })
    vizzes.push(created)
    return route.fulfill({ status: 201, json: created })
  }
  if (method === 'PATCH') {
    Object.assign(viz, body, body.config ? { type: body.config.type } : {})
    return route.fulfill({ json: viz })
  }
  if (method === 'DELETE') {
    vizzes.splice(vizzes.indexOf(viz), 1)
    return route.fulfill({ status: 204, body: '' })
  }
  return route.fulfill({ json: viz })
}

/**
 * Routes the API to the mock and signs in a headteacher. Returns `queries`,
 * the URLSearchParams of every query the page sends, and `errors`, every page
 * error and console error (checked by `expectNoErrors`), and `vizzes`, the
 * saved-visualization store.
 */
export async function mockBackend(page) {
  const queries = []
  const errors = []
  const vizzes = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  // Keep tests off the network: external requests (Google Fonts) get an empty
  // stylesheet, and the page falls back to system fonts.
  await page.route((url) => url.hostname !== 'localhost', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }))

  // Match on the path: Vite also serves source modules under /src/api/.
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/auth/me/') {
      return route.fulfill({ json: {
        id: 1, email: 'head@school.tz', role: 'HEADTEACHER', first_name: 'Head', last_name: 'Teacher',
        enabled_modules: ['analytics', 'reports'],
      } })
    }
    if (url.pathname === '/api/analytics/dimensions/') return route.fulfill({ json: catalogue })
    if (url.pathname.startsWith('/api/analytics/visualizations/')) return visualizationsRoute(route, url, vizzes)
    if (url.pathname === '/api/analytics/query/') {
      queries.push(url.searchParams)
      return route.fulfill({ json: queryResponse(url) })
    }
    return route.fulfill({ json: [] })
  })
  await page.addInitScript(() => localStorage.setItem('shule_access', 'test-token'))
  return { queries, errors, vizzes }
}

export function expectNoErrors(errors) {
  expect(errors, 'page and console errors').toEqual([])
}

// `test` with the mocked backend installed for every test (as the `backend`
// fixture), failing the test if the page logged an error.
export const test = base.extend({
  backend: [async ({ page }, use) => {
    const backend = await mockBackend(page)
    await use(backend)
    expectNoErrors(backend.errors)
  }, { auto: true }],
})
export { expect }

// ── page helpers ─────────────────────────────────────────────────────────────

export const typeSelect = (page) => page.getByRole('combobox').first()
export const updateButton = (page) => page.getByRole('button', { name: 'Update', exact: true })
export const chart = (page) => page.locator('.recharts-wrapper')
export const layoutZone = (page, name) =>
  page.locator('div.border-dashed').filter({ has: page.getByText(name, { exact: true }) })

/**
 * Opens a dimension from the panel and picks items: 'all', or a list of
 * labels. Clicks the modal's Update (which runs the query when the dimension
 * is on the layout).
 */
export async function pickItems(page, dimension, items) {
  await page.getByRole('button', { name: new RegExp(`^${dimension}`) }).first().click()
  const dialog = page.locator('.fixed.inset-0.z-50')
  if (items === 'all') {
    await dialog.getByRole('button', { name: /Select all/ }).click()
  } else {
    for (const label of items) await dialog.getByRole('button', { name: label, exact: true }).first().click()
  }
  await dialog.getByRole('button', { name: 'Update', exact: true }).click()
  await expect(dialog).toBeHidden()
}

// Moves a layout chip to another axis through its ⋮ menu.
export async function moveChip(page, dimension, axisName) {
  await page.getByRole('button', { name: `${dimension} options` }).click()
  await page.getByRole('button', { name: `Move to ${axisName}` }).click()
}

/**
 * The analytics page with both metrics in Columns, all three periods in Rows
 * and the whole school in Filter, updated.
 */
export async function openWithData(page) {
  await page.goto('/analytics')
  await pickItems(page, 'Data', 'all')
  await pickItems(page, 'Period', 'all')
  await expect(page.locator('table')).toBeVisible()
}

export async function chooseType(page, label) {
  await typeSelect(page).selectOption({ label })
}

export async function openDownload(page) {
  await page.getByRole('button', { name: 'Download', exact: true }).click()
}

export async function download(page, itemName) {
  await openDownload(page)
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: itemName }).click(),
  ])
  return file
}
