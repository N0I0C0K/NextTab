import { expect, test } from './fixtures'

test.use({ extensionLocale: 'zh-CN' })

test('recent page strip fits desktop, narrow, and short windows and remains keyboard accessible', async ({
  page,
  extensionId,
}, testInfo) => {
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(async () => {
    await chrome.storage.local.set({ 'onboarding-completed-key': true })
  })
  await page.reload()
  // Let the first empty-history calculation finish before seeding the display cache.
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          (await chrome.storage.local.get('recent-page-recommendations-v1'))['recent-page-recommendations-v1'],
      ),
    )
    .toBeTruthy()

  const titles = [
    'Review a very long merge request title that should remain readable when the window becomes narrow',
    'NextTab project roadmap',
    'Issue tracker: notification cleanup',
    'New tab design notes',
    'Usage dashboard',
    'Team knowledge base',
    'Pinned page should not be recommended twice',
  ]
  await page.evaluate(async titles => {
    const hosts = [
      'gitlab.example.com',
      'linear.example.com',
      'sentry.example.com',
      'verylonginternalprojectworkspace.example.com',
      'metabase.example.com',
      'notion.example.com',
      'pinned.example.com',
    ]
    const pages = titles.map((title, index) => ({
      url: `https://${hosts[index]}/project/page-${index}`,
      title,
      host: hosts[index],
      days28: 8 - index,
      days7: 3,
      lastVisitTime: Date.now() - index * 1000,
    }))
    await chrome.storage.local.set({
      'quick-url-item-storage-key': [{ id: 'pinned', title: 'Pinned page', url: pages[6].url }],
      'recent-page-recommendations-v1': { date: new Date().toDateString(), updatedAt: Date.now(), pages },
    })
  }, titles)
  await page.reload()

  const cards = page.getByTestId('recent-page-card')
  await expect(cards).toHaveCount(6)
  await expect(page.getByTestId('recent-pages-section')).toBeVisible()
  await expect(cards.first()).toHaveAttribute('title', /Review a very long merge request title.*gitlab\.example\.com/s)

  for (const [width, height, name, columns] of [
    [1440, 1000, 'desktop', 6],
    [600, 700, 'tablet', 3],
    [390, 700, 'narrow', 2],
    [320, 600, 'small', 2],
    [900, 360, 'short', 6],
  ] as const) {
    await page.setViewportSize({ width, height })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const first = await cards.nth(0).boundingBox()
    const lastOnRow = await cards.nth(columns - 1).boundingBox()
    expect(first).not.toBeNull()
    expect(lastOnRow).not.toBeNull()
    expect(Math.abs(lastOnRow!.y - first!.y)).toBeLessThan(2)
    if (columns < 6) {
      const nextRow = await cards.nth(columns).boundingBox()
      expect(nextRow!.y).toBeGreaterThan(first!.y)
    }
    await page.screenshot({ path: testInfo.outputPath(`recent-${name}.png`), fullPage: true })
  }

  await page.evaluate(async () => chrome.storage.local.set({ 'theme-storage-key': 'dark' }))
  await page.reload()
  await expect(cards).toHaveCount(6)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: testInfo.outputPath('recent-dark.png'), fullPage: true })

  await page.route('https://gitlab.example.com/project/page-0', route =>
    route.fulfill({ body: 'Opened recommended page' }),
  )
  await page.locator('#nt-recent-title').click()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('quick-link-card')).toHaveAttribute('data-selected', 'true')
  await cards.first().focus()
  await expect(cards.first()).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('https://gitlab.example.com/project/page-0')
})

test('homepage switch hides recent pages and restores them after reload', async ({ page, extensionId }, testInfo) => {
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(async () => chrome.storage.local.set({ 'onboarding-completed-key': true }))
  await page.reload()
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          (await chrome.storage.local.get('recent-page-recommendations-v1'))['recent-page-recommendations-v1'],
      ),
    )
    .toBeTruthy()

  await page.evaluate(async () => {
    await chrome.storage.local.set({
      'recent-page-recommendations-v1': {
        date: new Date().toDateString(),
        updatedAt: Date.now(),
        pages: [
          {
            url: 'https://gitlab.example.com/project/merge-request',
            title: 'Merge request',
            host: 'gitlab.example.com',
            days28: 4,
            days7: 2,
            lastVisitTime: Date.now(),
          },
        ],
      },
    })
  })
  await page.reload()
  await expect(page.getByTestId('recent-pages-section')).toBeVisible()

  await page.getByTestId('settings-trigger').click()
  const visibilitySwitch = page.getByRole('switch', { name: '显示最近常用' })
  await expect(visibilitySwitch).toHaveAttribute('aria-checked', 'true')
  await page.screenshot({ path: testInfo.outputPath('recent-setting-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 700 })
  await visibilitySwitch.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('recent-setting-narrow.png') })
  await page.setViewportSize({ width: 900, height: 360 })
  await visibilitySwitch.scrollIntoViewIfNeeded()
  await expect(visibilitySwitch).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('recent-setting-short.png') })
  await visibilitySwitch.click()
  await expect(page.getByTestId('recent-pages-section')).toHaveCount(0)
  await expect
    .poll(async () =>
      page.evaluate(
        async () => (await chrome.storage.local.get('settings-storage'))['settings-storage']?.showRecentPages,
      ),
    )
    .toBe(false)

  await page.reload()
  await expect(page.getByTestId('recent-pages-section')).toHaveCount(0)
  await page.getByTestId('settings-trigger').click()
  await expect(visibilitySwitch).toHaveAttribute('aria-checked', 'false')
  await visibilitySwitch.click()
  await expect(page.getByTestId('recent-pages-section')).toBeVisible()
})
