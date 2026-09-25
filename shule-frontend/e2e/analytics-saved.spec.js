// Saved visualizations: the File menu (New / Open / Save / Save as / Rename /
// Delete / Pin) and pinned widgets on the dashboard.
import { chart, chooseType, expect, layoutZone, openWithData, savedViz, test } from './analyticsMock'

const fileMenu = async (page, item) => {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: item, exact: true }).click()
}
const dialog = (page) => page.locator('.fixed.inset-0.z-50')
const chips = (page, zone) => layoutZone(page, zone).locator('button[title]')

test('saves a new visualization, then saves changes to it', async ({ page, backend }) => {
  await openWithData(page)
  await fileMenu(page, 'Save')
  await expect(dialog(page)).toContainText('Save visualization')
  await dialog(page).getByLabel('Name').fill('Scores by term')
  await dialog(page).getByLabel('Share with staff').check()
  await dialog(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog(page)).toBeHidden()

  expect(backend.vizzes).toHaveLength(1)
  const [viz] = backend.vizzes
  expect(viz).toMatchObject({ name: 'Scores by term', shared_with_staff: true, type: 'PIVOT_TABLE' })
  expect(viz.config.items.dx).toEqual(['exam.mean_score', 'exam.pass_rate'])
  await expect(page.getByText('Scores by term', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\?viz=1$/)

  await chooseType(page, 'Column chart')
  await expect(page.getByText('(unsaved changes)')).toBeVisible()
  await fileMenu(page, 'Save')
  await expect(page.getByText('(unsaved changes)')).toBeHidden()
  expect(backend.vizzes[0].type).toBe('COLUMN')
})

test('opens a saved visualization and draws it', async ({ page, backend }) => {
  backend.vizzes.push(savedViz(), savedViz({ id: 2, name: 'Other', shared_with_staff: true, is_owner: false }))
  await page.goto('/analytics')
  await fileMenu(page, 'Open…')
  await expect(dialog(page).getByRole('button')).toHaveCount(3) // close + two rows
  await dialog(page).getByPlaceholder('Search by name').fill('mean')
  await dialog(page).getByRole('button', { name: /Mean score by term/ }).click()

  await expect(page.locator('table')).toBeVisible()
  await expect(chips(page, 'Rows')).toHaveText([/^Period/])
  await expect(page.locator('table')).toContainText('Last term')
  expect(backend.queries.at(-1).getAll('dimension')).toEqual(['dx:exam.mean_score', 'pe:THIS_TERM;LAST_TERM'])
})

test('a shared visualization is read-only: Save becomes Save as', async ({ page, backend }) => {
  backend.vizzes.push(savedViz({ is_owner: false, shared_with_staff: true, created_by_name: 'Owner' }))
  await page.goto('/analytics?viz=1')
  await expect(page.locator('table')).toBeVisible()
  await expect(page.getByText('by Owner')).toBeVisible()

  await page.getByRole('button', { name: 'File', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'File' })
  await expect(menu.getByRole('menuitem', { name: 'Save', exact: true })).toBeDisabled()
  await expect(menu.getByRole('menuitem', { name: 'Rename…' })).toBeDisabled()
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeDisabled()
  await menu.getByRole('menuitem', { name: 'Save as…' }).click()
  await expect(dialog(page).getByLabel('Name')).toHaveValue('Mean score by term (copy)')
  await dialog(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog(page)).toBeHidden()
  expect(backend.vizzes.map((v) => v.name)).toEqual(['Mean score by term', 'Mean score by term (copy)'])
  await expect(page).toHaveURL(/\?viz=2$/)
})

test('renames and deletes', async ({ page, backend }) => {
  backend.vizzes.push(savedViz())
  await page.goto('/analytics?viz=1')
  await expect(page.locator('table')).toBeVisible()

  await fileMenu(page, 'Rename…')
  await dialog(page).getByLabel('Name').fill('Renamed')
  await dialog(page).getByRole('button', { name: 'Rename' }).click()
  await expect(page.getByText('Renamed', { exact: true })).toBeVisible()
  expect(backend.vizzes[0].name).toBe('Renamed')

  await fileMenu(page, 'Delete')
  await dialog(page).getByRole('button', { name: 'Delete' }).click()
  await expect(dialog(page)).toBeHidden()
  expect(backend.vizzes).toEqual([])
  await expect(page.getByText('Build a visualization')).toBeVisible()
  await expect(page).toHaveURL(/\/analytics$/)
})

test('explains a visualization that uses a switched-off module', async ({ page, backend }) => {
  backend.vizzes.push(savedViz({
    unavailable: [{ kind: 'metric', id: 'fees.collected', label: 'Collected (billing period)', reason: 'module_disabled', modules: ['fees'] }],
  }))
  await page.goto('/analytics?viz=1')
  await expect(page.getByText(/can't be drawn\. It uses Collected \(billing period\), from the Fees module, which is switched off/))
    .toBeVisible()
  expect(backend.queries).toHaveLength(0)
})

test.describe('dashboard', () => {
  test('pins from the File menu and draws the widget', async ({ page, backend }) => {
    backend.vizzes.push(savedViz({ type: 'COLUMN', config: { ...savedViz().config, type: 'COLUMN' } }))
    await page.goto('/analytics?viz=1')
    await expect(chart(page)).toBeVisible()
    await fileMenu(page, 'Pin to dashboard')
    await expect.poll(() => backend.vizzes[0].is_pinned).toBe(true)

    await page.goto('/dashboard')
    const widget = page.getByRole('region', { name: 'Pinned visualizations' })
    await expect(widget.getByText('Mean score by term')).toBeVisible()
    await expect(widget.locator('.recharts-wrapper')).toBeVisible()

    await widget.getByRole('button', { name: 'Unpin Mean score by term' }).click()
    await expect(widget).toBeHidden()
    expect(backend.vizzes[0].is_pinned).toBe(false)
  })

  test('shows a placeholder for a pinned visualization from a disabled module', async ({ page, backend }) => {
    backend.vizzes.push(savedViz({
      is_pinned: true,
      unavailable: [{ kind: 'metric', id: 'fees.collected', label: 'Collected (billing period)', reason: 'module_disabled', modules: ['fees'] }],
    }))
    await page.goto('/dashboard')
    const widget = page.getByRole('region', { name: 'Pinned visualizations' })
    await expect(widget.getByText('Not available')).toBeVisible()
    await expect(widget).toContainText('from the Fees module, which is switched off for this school')
    expect(backend.queries).toHaveLength(0)
  })

  test('links a widget to the analytics page', async ({ page, backend }) => {
    backend.vizzes.push(savedViz({ is_pinned: true }))
    await page.goto('/dashboard')
    await page.getByRole('link', { name: 'Open Mean score by term in Analytics' }).click()
    await expect(page).toHaveURL(/\/analytics\?viz=1$/)
    await expect(page.getByText('Mean score by term')).toBeVisible()
    await expect(page.locator('table')).toBeVisible()
  })
})
