// Drill-down: clicking a pivot cell lists the pupils behind it in a side panel.
import { expect, openWithData, test } from './analyticsMock'

const panel = (page) => page.getByRole('dialog', { name: 'Pupils in this cell' })
// Row 1 is This term; column 1 is Mean score, column 2 Pass rate.
const cell = (page, column) => page.locator('tbody tr').first().locator('td').nth(column)

test.beforeEach(async ({ page }) => {
  await openWithData(page)
})

test('opens the pupils behind a cell, asking for exactly that cell', async ({ page, backend }) => {
  await cell(page, 0).getByRole('button').click()

  await expect(panel(page)).toBeVisible()
  await expect(panel(page)).toContainText('Mean score')
  await expect(panel(page)).toContainText('This term')
  const rows = panel(page).locator('tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Asha Juma')
  await expect(rows.first()).toContainText('FORM1 A')
  await expect(rows.first()).toContainText('72.5%')
  await expect(panel(page).getByRole('link', { name: 'Asha Juma' }))
    .toHaveAttribute('href', '/students/6f1c0000-0000-4000-8000-000000000001')
  await expect(panel(page)).toContainText('2 pupils.')

  expect(backend.drilldowns).toHaveLength(1)
  const params = backend.drilldowns[0]
  expect(params.getAll('dimension')).toEqual(['dx:exam.mean_score'])
  expect(params.getAll('filter')).toEqual(expect.arrayContaining(['pe:THIS_TERM']))
})

test('closes with the close button and with Escape', async ({ page }) => {
  await cell(page, 0).getByRole('button').click()
  await panel(page).getByRole('button', { name: 'Close' }).click()
  await expect(panel(page)).toBeHidden()

  await cell(page, 0).getByRole('button').click()
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
})

test('leaves cells plain when the role may not list their pupils', async ({ page, backend }) => {
  await expect(cell(page, 1)).not.toBeEmpty()
  await expect(cell(page, 1).getByRole('button')).toHaveCount(0)
  expect(backend.drilldowns).toHaveLength(0)
})
