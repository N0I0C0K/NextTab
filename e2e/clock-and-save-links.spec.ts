import { test, expect } from './fixtures'

test.use({ extensionLocale: 'zh-CN' })

test('clock changes on the minute and catches up on focus', async ({ page, extensionId }) => {
  await page.clock.install({ time: new Date('2026-10-21T23:50:00+08:00') })
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(() => chrome.storage.local.set({ 'onboarding-completed-key': true }))
  await page.reload()
  await page.clock.pauseAt(new Date('2026-10-21T23:59:58.500+08:00'))
  const initial = await page.locator('.nt-clock').textContent()
  const date = await page.locator('.nt-date').textContent()
  await page.clock.runFor(1499)
  await expect(page.locator('.nt-clock')).toHaveText(initial!)
  await page.clock.runFor(1)
  await expect(page.locator('.nt-clock')).not.toHaveText(initial!)
  // The local date rolls over at local midnight, whatever timezone the test host uses.
  await page.clock.setSystemTime(new Date('2026-10-23T12:34:27+08:00'))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.locator('.nt-date')).not.toHaveText(date!)
  await expect(page.locator('.nt-clock')).toHaveText(
    await page.evaluate(() =>
      new Date().toLocaleTimeString(chrome.i18n.getUILanguage(), { hour: '2-digit', minute: '2-digit', hour12: false }),
    ),
  )
})

test('page rows have one complete more menu, preserve URLs and support keyboard, duplicate prevention and retry', async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  const url = 'https://docs.save.test/guide?view=long#keyboard'
  const title = 'A long saved page title with query parameters and fragment preserved'
  await context.route('https://docs.save.test/**', route =>
    route.fulfill({ contentType: 'text/html', body: `<title>${title}</title>` }),
  )
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(() =>
    chrome.storage.local.set({
      'onboarding-completed-key': true,
      'quick-url-item-storage-key': [{ id: 'docs', title: 'Docs', url: 'https://docs.save.test/' }],
      'theme-storage-key': 'light',
    }),
  )
  const visited = await context.newPage()
  await visited.goto(url)
  await visited.close()
  await page.reload()
  const row = page.locator('[data-home-return-row][data-visible="true"] [data-testid="return-page-row"]').first()
  const initialPageCount = context.pages().length
  const more = row.locator('.nt-return-more')
  const save = page.getByTestId('save-quick-link')
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 700 },
    { width: 320, height: 600 },
    { width: 900, height: 360 },
  ]) {
    await page.setViewportSize(viewport)
    await row.scrollIntoViewIfNeeded()
    await row.click({ button: 'right' })
    await expect(page.getByRole('menu')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await row.hover()
    await more.click()
    await expect(save).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('menuitem')).toHaveCount(5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`single-menu-${viewport.width}.png`) })
    await page.keyboard.press('Escape')
    await expect(more).toBeFocused()
  }
  await more.press('Enter')
  await save.press('Enter')
  await expect
    .poll(() =>
      page.evaluate(
        async value =>
          (await chrome.storage.local.get('quick-url-item-storage-key'))['quick-url-item-storage-key'].filter(
            (item: { url: string }) => item.url === value,
          ).length,
        url,
      ),
    )
    .toBe(1)
  await expect(more).toBeFocused()
  await more.press('Enter')
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    const set = chrome.storage.local.set.bind(chrome.storage.local)
    let rejectOnce = true
    Object.defineProperty(chrome.storage.local, 'set', {
      configurable: true,
      value: (items: Record<string, unknown>) => {
        if (rejectOnce && 'quick-url-item-storage-key' in items) {
          rejectOnce = false
          return Promise.reject(new Error('Storage unavailable'))
        }
        return set(items)
      },
    })
  })
  await page.evaluate(() => chrome.storage.local.remove('quick-url-item-storage-key'))
  await more.click()
  await expect(save).not.toHaveAttribute('aria-disabled', 'true')
  await save.click({ modifiers: ['Control'] })
  await expect(page.locator('[data-sonner-toast][data-type=error]')).toBeVisible()
  await more.click()
  await save.click()
  const stored = await page.evaluate(
    async () => (await chrome.storage.local.get('quick-url-item-storage-key'))['quick-url-item-storage-key'],
  )
  expect(stored).toHaveLength(1)
  expect(stored[0]).toMatchObject({ title, url })
  expect(context.pages()).toHaveLength(initialPageCount)
  expect(page.url()).toContain('/newtab.html')
})

test('search and standalone history keep their original interactions without extra action buttons or right-click menus', async ({
  page,
  context,
  extensionId,
}) => {
  await context.route('https://docs.save.test/**', route =>
    route.fulfill({ contentType: 'text/html', body: '<title>History guide</title>' }),
  )
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      'onboarding-completed-key': true,
      'quick-url-item-storage-key': [{ id: 'docs', title: 'Docs', url: 'https://docs.save.test/' }],
    })
    await chrome.bookmarks.create({ title: 'Saved guide', url: 'https://docs.save.test/saved' })
  })
  const visited = await context.newPage()
  await visited.goto('https://docs.save.test/history')
  await visited.close()
  await page.reload()
  await page.getByTestId('command-shortcut-history').click()
  const input = page.getByTestId('command-input')
  await input.fill('docs.save.test')
  const result = page.getByTestId('command-result').filter({ hasText: 'History guide' })
  await result.click({ button: 'right' })
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(result.getByRole('button')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await input.press('Escape')
  const card = page.getByTestId('quick-link-card').first()
  await card.click({ button: 'right' })
  await expect(page.getByTestId('related-bookmark')).toBeVisible()
  await expect(page.getByTestId('save-quick-link')).toHaveCount(0)
  await page.getByTestId('quick-link-history').click()
  const history = page.getByTestId('domain-history-dialog')
  const row = history.getByTestId('domain-history-item').filter({ hasText: 'History guide' })
  await row.click({ button: 'right' })
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(row.getByRole('button')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(history).toHaveCount(0)
})

test('saving a site history page keeps its row and keyboard focus and appears in Saved', async ({
  page,
  context,
  extensionId,
}) => {
  const url = 'https://docs.focus.test/recent'
  await context.route('https://docs.focus.test/**', route =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<title>Recent documentation</title>',
    }),
  )
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(() =>
    chrome.storage.local.set({
      'onboarding-completed-key': true,
      'quick-url-item-storage-key': [{ id: 'docs', title: 'Docs', url: 'https://docs.focus.test/' }],
    }),
  )
  const visited = await context.newPage()
  await visited.goto(url)
  await visited.close()
  await page.reload()
  await page.setViewportSize({ width: 900, height: 360 })
  await page.getByTestId('quick-link-card').first().locator('.nt-link-expand').click()
  const dialog = page.getByTestId('site-pages-dialog')
  await dialog.getByTestId('site-tab-history').click()
  const row = dialog.locator(`[data-page-url="${url}"]`)
  const save = page.getByTestId('save-quick-link')
  const primary = row.locator('.nt-return-open')
  await row.hover()
  await row.locator('.nt-return-more').click()
  await save.press('Enter')
  await expect(row.locator('.nt-return-more')).toBeFocused()
  await expect(primary).toBeInViewport()
  await expect(dialog.getByTestId('site-tab-history')).toHaveAttribute('aria-selected', 'true')
  // External storage changes update the button without regrouping the opened list.
  await page.evaluate(async value => {
    const key = 'quick-url-item-storage-key'
    const links = (await chrome.storage.local.get(key))[key]
    await chrome.storage.local.set({ [key]: links.filter((item: { url: string }) => item.url !== value) })
  }, url)
  await row.hover()
  await row.locator('.nt-return-more').click()
  await expect(save).not.toHaveAttribute('aria-disabled', 'true')
  await save.press('Enter')
  await expect(save).toHaveCount(0)
  await row.locator('.nt-return-more').press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.getByTestId('quick-link-card').first().locator('.nt-link-expand').click()
  await dialog.getByTestId('site-tab-saved').click()
  await row.hover()
  await row.locator('.nt-return-more').click()
  await expect(save).toHaveAttribute('aria-disabled', 'true')
})
