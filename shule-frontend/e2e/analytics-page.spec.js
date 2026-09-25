// How the analytics page ties the charts together: type switching, layout
// rules and auto-fix, and Download.
import { readFile } from 'node:fs/promises'
import {
  chart, chooseType, download, expect, layoutZone, moveChip, openDownload, openWithData, pickItems, test,
  updateButton,
} from './analyticsMock'

const banner = (page) => page.locator('div.bg-amber-50').filter({ has: page.getByRole('button', { name: 'Fix layout' }) })
const chips = (page, zone) => layoutZone(page, zone).locator('button[title]')

test.describe('switching type', () => {
  test.beforeEach(async ({ page }) => {
    await openWithData(page)
  })

  test('renames the axes for charts', async ({ page }) => {
    await expect(layoutZone(page, 'Columns')).toBeVisible()
    await expect(layoutZone(page, 'Rows')).toBeVisible()
    await chooseType(page, 'Line chart')
    await expect(layoutZone(page, 'Series')).toBeVisible()
    await expect(layoutZone(page, 'Category')).toBeVisible()
    await expect(layoutZone(page, 'Filter')).toBeVisible()
  })

  test('redraws a compatible layout at once, without querying again', async ({ page, backend }) => {
    const sent = backend.queries.length
    await chooseType(page, 'Column chart')
    await expect(chart(page)).toBeVisible()
    await chooseType(page, 'Pivot table')
    await expect(page.locator('table')).toBeVisible()
    expect(backend.queries.length).toBe(sent)
    await expect(page.getByText('Layout changed')).toBeHidden()
  })

  test('explains an incompatible layout and waits for a fix', async ({ page, backend }) => {
    await chooseType(page, 'Pie chart')
    await expect(banner(page)).toContainText('A pie chart takes exactly one dimension in Series and none in Category.')
    await expect(banner(page)).toContainText('Auto-fix will move Period to Filter.')
    // The table stays until the layout can be drawn.
    await expect(page.locator('table')).toBeVisible()
    await expect(page.getByText('Layout changed')).toBeVisible()

    // Update does nothing while the layout is incompatible.
    const sent = backend.queries.length
    await updateButton(page).click()
    await expect(page.locator('table')).toBeVisible()
    expect(backend.queries.length).toBe(sent)
  })

  test('auto-fixes a pie chart layout and draws it', async ({ page, backend }) => {
    await chooseType(page, 'Pie chart')
    const sent = backend.queries.length
    await page.getByRole('button', { name: 'Fix layout' }).click()
    await expect(banner(page)).toBeHidden()
    await expect(chips(page, 'Series')).toHaveText([/^Data/])
    await expect(chips(page, 'Filter')).toHaveText([/^Period/, /^Classes/])
    await expect(page.locator('.recharts-pie-sector')).toHaveCount(2)

    expect(backend.queries.length).toBe(sent + 1)
    const query = backend.queries.at(-1)
    expect(query.getAll('dimension')).toEqual(['dx:exam.mean_score;exam.pass_rate'])
    expect(query.getAll('filter')).toEqual(['pe:THIS_TERM;LAST_TERM;THIS_YEAR', 'ou:SCHOOL'])
  })

  test('auto-fixes a single value down to one data item', async ({ page }) => {
    await chooseType(page, 'Single value')
    await expect(banner(page)).toContainText('keep only the first data item')
    await page.getByRole('button', { name: 'Fix layout' }).click()
    await expect(chips(page, 'Series')).toHaveText([/^Data\s*1$/])
    await expect(page.locator('svg[role="img"]')).toBeVisible()
  })

  test('sends a single-item Data filter as a dimension', async ({ page, backend }) => {
    await chooseType(page, 'Pie chart')
    await page.getByRole('button', { name: /^Data/ }).first().click()
    await page.locator('.fixed.inset-0.z-50').getByRole('button', { name: 'Remove Pass rate' }).click()
    await page.locator('.fixed.inset-0.z-50').getByRole('button', { name: 'Hide', exact: true }).click()
    // Period in Series, Data (one item) in Filter.
    await moveChip(page, 'Period', 'Series')
    await moveChip(page, 'Data', 'Filter')
    await expect(banner(page)).toBeHidden()
    await updateButton(page).click()
    await expect(page.locator('.recharts-pie-sector')).toHaveCount(3)
    const query = backend.queries.at(-1)
    expect(query.getAll('dimension')).toEqual(['pe:THIS_TERM;LAST_TERM;THIS_YEAR', 'dx:exam.mean_score'])
  })
})

test('offers to swap series and category when there are too many series', async ({ page }) => {
  await page.goto('/analytics')
  await pickItems(page, 'Data', ['Mean score'])
  await pickItems(page, 'Classes', 'all')
  await chooseType(page, 'Column chart')
  // Classes (11 items) in Series, the one period in Category, Data in Filter.
  await moveChip(page, 'Classes', 'Series')
  await moveChip(page, 'Data', 'Filter')
  await updateButton(page).click()

  await expect(page.getByText('Too many series to tell apart')).toBeVisible()
  await expect(page.getByText(/would need 11 colours/)).toBeVisible()
  await page.getByRole('button', { name: 'Swap Series and Category' }).click()

  await expect(chips(page, 'Series')).toHaveText([/^Period/])
  await expect(chips(page, 'Category')).toHaveText([/^Classes/])
  await expect(page.locator('.recharts-bar-rectangle path')).toHaveCount(11)
})

test.describe('download', () => {
  test('is unavailable until there is data', async ({ page }) => {
    await page.goto('/analytics')
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeDisabled()
  })

  test('saves the table as CSV', async ({ page }) => {
    await openWithData(page)
    const file = await download(page, 'CSV (.csv)')
    expect(file.suggestedFilename()).toMatch(/^shule-analytics-\d{4}-\d{2}-\d{2}\.csv$/)
    const text = await readFile(await file.path(), 'utf8')
    expect(text).toBe('﻿Period,Mean score,Pass rate\r\nThis term,55,65\r\nLast term,60,70\r\nThis year,65,75')
  })

  test('saves the table as an Excel workbook', async ({ page }) => {
    await openWithData(page)
    const file = await download(page, 'Excel (.xlsx)')
    expect(file.suggestedFilename()).toMatch(/\.xlsx$/)
    const bytes = await readFile(await file.path())
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    expect(bytes.includes(Buffer.from('xl/worksheets/sheet1.xml'))).toBe(true)
    expect(bytes.includes(Buffer.from('<t xml:space="preserve">Mean score</t>'))).toBe(true)
  })

  test('saves the table behind a chart too', async ({ page }) => {
    await openWithData(page)
    await chooseType(page, 'Line chart')
    const file = await download(page, 'CSV (.csv)')
    const text = await readFile(await file.path(), 'utf8')
    expect(text).toContain('This year,65,75')
  })

  test('has no image for a pivot table', async ({ page }) => {
    await openWithData(page)
    await openDownload(page)
    await expect(page.getByRole('menuitem', { name: 'Image (.png)' })).toBeDisabled()
  })

  test('saves a chart as PNG, with room for the title and legend', async ({ page }) => {
    await openWithData(page)
    await chooseType(page, 'Column chart')
    const svg = page.locator('.recharts-wrapper > svg')
    await expect(page.locator('.recharts-bar-rectangle path')).toHaveCount(6)
    const box = await svg.boundingBox()

    const file = await download(page, 'Image (.png)')
    expect(file.suggestedFilename()).toMatch(/\.png$/)
    const png = await readFile(await file.path())
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    // IHDR: drawn at 2x, with 24px padding each side, plus title, subtitle and legend rows.
    const width = png.readUInt32BE(16)
    const height = png.readUInt32BE(20)
    // (The canvas truncates a fractional on-screen width.)
    expect(Math.abs(width - (box.width + 48) * 2)).toBeLessThanOrEqual(2)
    expect(height).toBeGreaterThan((box.height + 48 + 60) * 2)
  })

  test('saves a single value as PNG', async ({ page }) => {
    await openWithData(page)
    await chooseType(page, 'Single value')
    await page.getByRole('button', { name: 'Fix layout' }).click()
    await expect(page.locator('svg[role="img"]')).toBeVisible()
    const file = await download(page, 'Image (.png)')
    const png = await readFile(await file.path())
    expect(png.readUInt32BE(16)).toBeGreaterThan(0)
  })

  test('keeps data labels on screen while the menu is open', async ({ page }) => {
    // Opening the menu re-renders the page; a replayed chart animation would
    // hide the labels (and drop them from the PNG).
    await openWithData(page)
    await chooseType(page, 'Column chart')
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.getByLabel('Show data labels').check()
    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(page.locator('.recharts-label-list text')).toHaveCount(6)
    await openDownload(page)
    expect(await page.locator('.recharts-label-list text').count()).toBe(6)
  })
})
