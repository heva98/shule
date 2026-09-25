// The chart renderers, drawn by recharts in a real browser. Values come from
// `mockValue`: with Data in Series and Period in Category, Mean score is
// 55 / 60 / 65 % and Pass rate 65 / 70 / 75 % for This term / Last term / This year.
import {
  chart, chooseType, expect, openWithData, test, updateButton,
} from './analyticsMock'

const bars = (page) => page.locator('.recharts-bar-rectangle path')
// recharts draws tick labels in their own layer, outside the axis group.
const xTicks = (page) => page.locator('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')
const yTicks = (page) => page.locator('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value')
const legend = (page) => page.locator('section ul').first()

async function setOptions(page, set) {
  await page.getByRole('button', { name: 'Options', exact: true }).click()
  await set(page.locator('.fixed.inset-0.z-50'))
  await page.getByRole('button', { name: 'Apply' }).click()
}

test.beforeEach(async ({ page }) => {
  await openWithData(page)
})

test.describe('column chart', () => {
  test.beforeEach(async ({ page }) => {
    await chooseType(page, 'Column chart')
    await expect(chart(page)).toBeVisible()
  })

  test('draws a bar per series and category, with a legend', async ({ page }) => {
    await expect(bars(page)).toHaveCount(6)
    await expect(xTicks(page)).toHaveText(['This term', 'Last term', 'This year'])
    await expect(legend(page).locator('li')).toHaveText(['Mean score', 'Pass rate'])
    // The y axis is in percent: every metric on it is a percentage.
    await expect(yTicks(page).last()).toHaveText(/%$/)
  })

  test('shows each category’s values on hover', async ({ page }) => {
    const lastTerm = bars(page).nth(1)
    await lastTerm.hover()
    const tooltip = page.locator('.recharts-tooltip-wrapper')
    await expect(tooltip).toContainText('Last term')
    await expect(tooltip).toContainText('Mean score:60%')
    await expect(tooltip).toContainText('Pass rate:70%')
  })

  test('shows data labels with the chosen decimals', async ({ page }) => {
    await setOptions(page, async (modal) => {
      await modal.getByLabel('Show data labels').check()
      await modal.locator('select').first().selectOption('1')
    })
    await expect(page.locator('.recharts-label-list text')).toHaveText(
      ['55.0%', '60.0%', '65.0%', '65.0%', '70.0%', '75.0%'],
    )
  })

  test('draws a labelled target line', async ({ page }) => {
    await setOptions(page, async (modal) => {
      await modal.getByLabel('Target value').fill('50')
      await modal.getByLabel('Target label').fill('Pass mark')
    })
    await expect(page.locator('.recharts-reference-line line')).toHaveCount(1)
    // The label is drawn in a separate layer from the line.
    await expect(chart(page).getByText('Pass mark 50%')).toBeVisible()
  })

  test('sorts categories by their total', async ({ page }) => {
    await setOptions(page, (modal) => modal.locator('select').nth(1).selectOption('desc'))
    await expect(xTicks(page)).toHaveText(['This year', 'Last term', 'This term'])
    await setOptions(page, (modal) => modal.locator('select').nth(1).selectOption('asc'))
    await expect(xTicks(page)).toHaveText(['This term', 'Last term', 'This year'])
  })

  test('keeps each series’ colour when sorted', async ({ page }) => {
    const fills = () => bars(page).evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('fill')))])
    const before = await fills()
    expect(before).toHaveLength(2)
    await setOptions(page, (modal) => modal.locator('select').nth(1).selectOption('desc'))
    await expect(xTicks(page).first()).toHaveText('This year')
    expect(await fills()).toEqual(before)
  })
})

test('stacked column chart stacks the series in one column per category', async ({ page }) => {
  await chooseType(page, 'Stacked column chart')
  await expect(bars(page)).toHaveCount(6)
  const measure = () => bars(page).evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect()
    return { x: Math.round(r.x), top: r.top, bottom: r.bottom }
  }))
  // Wait out the grow-in animation, then read the settled geometry.
  await expect.poll(async () => new Set((await measure()).map((b) => b.x)).size).toBe(3)
  const boxes = await measure()
  const columns = new Set(boxes.map((b) => b.x))
  // Within a column, the second series sits on top of the first.
  for (const x of columns) {
    const [first, second] = boxes.filter((b) => b.x === x)
    expect(second.bottom).toBeLessThanOrEqual(first.top + 2)
  }
})

test('bar chart lays the categories down the y axis', async ({ page }) => {
  await chooseType(page, 'Bar chart')
  await expect(bars(page)).toHaveCount(6)
  await expect(yTicks(page)).toHaveText(['This term', 'Last term', 'This year'])
  await expect(xTicks(page).last()).toHaveText(/%$/)
  // Bars grow rightwards: the bigger value is the wider bar.
  // Mean score: This year 65 > This term 55 (once the grow-in animation ends).
  await expect.poll(() => bars(page).evaluateAll((els) => {
    const [a, , c] = els.map((e) => e.getBoundingClientRect().width)
    return c > a && a > 0
  })).toBe(true)
})

test('line chart draws a line with a dot per point for each series', async ({ page }) => {
  await chooseType(page, 'Line chart')
  await expect(page.locator('.recharts-line-curve')).toHaveCount(2)
  await expect(page.locator('.recharts-line-dots circle')).toHaveCount(6)
  await expect(xTicks(page)).toHaveText(['This term', 'Last term', 'This year'])
})

test('pie chart draws a slice per series item', async ({ page }) => {
  await chooseType(page, 'Pie chart')
  await page.getByRole('button', { name: 'Fix layout' }).click()
  // Period moved to Filter: Mean score 50 %, Pass rate 60 %.
  await expect(page.locator('.recharts-pie-sector')).toHaveCount(2)
  await expect(legend(page).locator('li')).toHaveText(['Mean score', 'Pass rate'])
  await page.locator('.recharts-pie-sector').first().hover()
  await expect(page.locator('.recharts-tooltip-wrapper')).toContainText('Mean score: 50%')
})

test('pie chart shows name and value labels on request', async ({ page }) => {
  await chooseType(page, 'Pie chart')
  await page.getByRole('button', { name: 'Fix layout' }).click()
  await setOptions(page, (modal) => modal.getByLabel('Show data labels').check())
  await expect(page.locator('.recharts-pie-label-text')).toHaveText(['Mean score: 50%', 'Pass rate: 60%'])
})

test('single value shows one number against the target', async ({ page }) => {
  await chooseType(page, 'Single value')
  await page.getByRole('button', { name: 'Fix layout' }).click()
  const value = page.locator('svg[role="img"]')
  await expect(value).toHaveAttribute('aria-label', 'Mean score: 50%')
  await expect(value).toContainText('Period: This term, Last term, This year')

  await setOptions(page, async (modal) => {
    await modal.getByLabel('Target value').fill('45.5')
    await modal.getByLabel('Target label').fill('pass mark')
  })
  await expect(value).toContainText('▲ 4.5 points above pass mark')
  await setOptions(page, (modal) => modal.getByLabel('Target value').fill('60'))
  await expect(value).toContainText('▼ 10 points below pass mark')
})

test('a chart layout change redraws after Update', async ({ page }) => {
  await chooseType(page, 'Column chart')
  await expect(bars(page)).toHaveCount(6)
  await page.getByRole('button', { name: /^Period/ }).first().click()
  const modal = page.locator('.fixed.inset-0.z-50')
  await modal.getByRole('button', { name: 'Remove This year' }).click()
  await modal.getByRole('button', { name: 'Hide', exact: true }).click()
  await expect(bars(page)).toHaveCount(6)
  await updateButton(page).click()
  await expect(bars(page)).toHaveCount(4)
})
