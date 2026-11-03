import { expect, test } from './fixtures'

test.use({ extensionLocale: 'zh-CN' })

test('quick link menu recommends two frequent recent pages from its domain', async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await context.route('https://code.example.com/**', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Recommended page</title>' }),
  )
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      'onboarding-completed-key': true,
      'quick-url-item-storage-key': [{ id: 'code', title: 'Code', url: 'https://code.example.com/current' }],
    })
    await chrome.bookmarks.create({ title: 'Bookmarked page', url: 'https://code.example.com/bookmarked' })
    for (let index = 0; index < 7; index++) {
      await chrome.bookmarks.create({
        title: `Another bookmarked page ${index}`,
        url: `https://code.example.com/extra-bookmark-${index}`,
      })
    }
    await chrome.tabs.create({ url: 'https://code.example.com/open', active: false })
  })
  await page.reload()
  await expect(page.getByTestId('quick-link-card')).toHaveCount(1)
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const [relatedTab] = await chrome.tabs.query({ url: '*://code.example.com/open' })
        return relatedTab?.url
      }),
    )
    .toBe('https://code.example.com/open')

  await page.evaluate(() => {
    const day = 24 * 60 * 60 * 1000
    const now = Date.now()
    const entries = [
      { path: 'current', days: [1, 2, 3] },
      { path: 'bookmarked', days: [1, 2, 3] },
      { path: 'open', days: [1, 2, 3] },
      { path: 'recent', days: [1, 2, 3] },
      { path: 'another', days: [2, 4, 5] },
      { path: 'older', days: [15, 17, 19, 21, 23] },
      { path: 'one-off', days: [1, 1, 1] },
    ]
    const historyItems = entries.map((entry, index) => ({
      id: String(index),
      url: `https://code.example.com/${entry.path}`,
      title: `A long project page title for ${entry.path} that should truncate cleanly in a narrow context menu`,
      visitCount: entry.days.length,
      lastVisitTime: now - entry.days[0] * day,
    }))
    historyItems.push({
      id: 'off-domain',
      url: 'https://other.example.com/off-domain',
      title: 'Off domain page',
      visitCount: 100,
      lastVisitTime: now,
    })
    chrome.history.search = async () => historyItems
    chrome.history.getVisits = async ({ url }) => {
      const entry = entries.find(item => url.endsWith(`/${item.path}`))
      const days = url.startsWith('https://other.example.com/') ? [1, 2, 3, 4] : (entry?.days ?? [])
      return days.map((daysAgo, index) => ({
        id: String(index),
        visitId: String(index),
        visitTime: now - daysAgo * day,
        referringVisitId: '0',
        transition: 'link' as const,
      }))
    }
  })

  const card = page.getByTestId('quick-link-card')
  const menu = page.locator('[data-slot="context-menu-content"]')
  const recommended = page.getByTestId('domain-recommended-page')
  for (const [width, height, name] of [
    [1440, 1000, 'desktop'],
    [390, 700, 'narrow'],
    [320, 600, 'small'],
    [900, 360, 'short'],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.bringToFront()
    await card.click({ button: 'right' })
    await expect(menu.locator('[data-slot="context-menu-label"]')).toHaveCount(0)
    await expect(page.getByTestId('related-tab')).toHaveCount(1)
    await expect(recommended).toHaveCount(2)
    await expect(recommended.nth(0)).toContainText('recent')
    await expect(recommended.nth(1)).toContainText('another')
    await expect(recommended.nth(0).locator('span[title]')).toHaveAttribute(
      'title',
      /long project page title.*code\.example\.com/s,
    )
    await expect(page.getByTestId('related-bookmark')).toHaveCount(5)
    await expect(page.getByTestId('all-site-pages')).toHaveCount(1)
    await expect(menu.getByTestId('site-page-source')).toHaveText([
      '常去',
      '常去',
      '收藏',
      '收藏',
      '收藏',
      '收藏',
      '收藏',
      '标签页',
    ])
    for (const row of await menu
      .locator('[data-slot="context-menu-item"]')
      .filter({
        has: page.getByTestId('site-page-source'),
      })
      .all()) {
      const label = await row.getByTestId('site-page-source').boundingBox()
      const title = await row.locator('span[title]').boundingBox()
      expect(label).not.toBeNull()
      expect(title).not.toBeNull()
      expect(title!.width).toBeGreaterThan(100)
      expect(title!.x + title!.width).toBeLessThanOrEqual(label!.x)
    }
    await expect(page.getByTestId('related-tab')).toHaveCount(1)
    const bounds = await menu.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`domain-menu-${name}.png`) })
    if (name === 'short') {
      await page.getByTestId('all-site-pages').focus()
      const lastItem = await page.getByTestId('all-site-pages').boundingBox()
      expect(lastItem).not.toBeNull()
      expect(lastItem!.y).toBeGreaterThanOrEqual(0)
      expect(lastItem!.y + lastItem!.height).toBeLessThanOrEqual(height)
    }
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  }

  await page.setViewportSize({ width: 1440, height: 1000 })
  await card.click({ button: 'right' })
  await recommended.first().focus()
  await page.keyboard.press('End')
  await expect(page.getByTestId('all-site-pages')).toBeFocused()
  await page.keyboard.press('Enter')
  const dialog = page.getByTestId('site-pages-dialog')
  await expect(dialog).toBeVisible()
  await expect(menu).toHaveCount(0)
  await expect(dialog.getByTestId('site-tab-tabs')).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByRole('tab')).toHaveCount(3)
  await page.keyboard.press('Escape')
  await expect(card.locator('.nt-link-expand')).toBeFocused()
  await page.evaluate(() => chrome.storage.local.set({ 'theme-storage-key': 'dark' }))
  await expect(page.locator('html')).toHaveClass(/dark/)
  await card.click({ button: 'right' })
  await expect(menu.getByTestId('site-page-source')).toHaveCount(8)
  await page.screenshot({ path: testInfo.outputPath('domain-menu-dark.png'), animations: 'disabled' })
  await expect(recommended).toHaveCount(2)
  await recommended.first().focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('https://code.example.com/recent')
})
