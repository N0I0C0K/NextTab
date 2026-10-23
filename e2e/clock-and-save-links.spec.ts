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

test('page lists and search results save through menus without navigation, preserve URLs and retry failures', async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  const url = 'https://docs.save.test/guide?view=long#keyboard'
  const title = 'NextTab 常用网站：长标题与键盘交互说明 / 保存完整地址并保留查询参数'
  await context.route('https://docs.save.test/**', route =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<title>${title}</title>` }),
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
  const save = page.getByTestId('save-quick-link')
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 700 },
    { width: 320, height: 600 },
    { width: 900, height: 360 },
  ]) {
    await page.setViewportSize(viewport)
    await row.locator('.nt-return-open').scrollIntoViewIfNeeded()
    await expect(row.locator('button[data-testid="save-quick-link"]')).toHaveCount(0)
    await row.click({ button: 'right' })
    await expect(save).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`save-menu-${viewport.width}.png`) })
    await page.keyboard.press('Escape')
  }
  await row.locator('.nt-return-open').focus()
  await page.keyboard.press('Shift+F10')
  await expect(save).toBeVisible()
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
  expect(page.url()).toContain('/newtab.html')
  await row.hover()
  await row.locator('.nt-return-more').click()
  await expect(save).toHaveText('已在常用网站中')
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByTestId('command-shortcut-history').click()
  await page.getByTestId('command-input').fill('docs.save.test')
  const result = page.getByTestId('command-result').filter({ hasText: title })
  await result.click({ button: 'right' })
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
  // Remove the saved link with the original API before testing failure/retry.
  await page.evaluate(() => chrome.storage.local.remove('quick-url-item-storage-key'))
  await result.click({ button: 'right' })
  await expect(save).not.toHaveAttribute('aria-disabled', 'true')
  await save.click({ modifiers: ['Control'] })
  await expect(page.getByText('添加失败，请重试。', { exact: true })).toBeVisible()
  await result.click({ button: 'right' })
  await save.click()
  await expect(page.getByTestId('command-panel')).toBeVisible()
  expect(page.url()).toContain('/newtab.html')
  const saved = await page.evaluate(
    async () => (await chrome.storage.local.get('quick-url-item-storage-key'))['quick-url-item-storage-key'],
  )
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({ title, url })
})

test('links already inside a context menu have no save action; domain history uses its own right-click menu', async ({
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
  const card = page.getByTestId('quick-link-card').first()
  await card.click({ button: 'right' })
  await expect(page.getByTestId('related-bookmark')).toBeVisible()
  await expect(page.getByTestId('save-quick-link')).toHaveCount(0)
  await page.getByTestId('quick-link-history').click()
  const history = page.getByTestId('domain-history-dialog')
  const row = history.getByTestId('domain-history-item').filter({ hasText: 'History guide' })
  await row.click({ button: 'right' })
  const save = page.getByTestId('save-quick-link')
  await save.click()
  expect(page.url()).toContain('/newtab.html')
  await row.click({ button: 'right' })
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')
  await expect(save).toHaveCount(0)
  await expect(history).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveAttribute('data-open', '')
  await page.keyboard.press('Escape')
  await expect(history).toHaveCount(0)
})

for (const source of ['search', 'domain history'] as const) {
  test(`${source} opens the selected link menu from the input keyboard and Escape dismisses one surface`, async ({
    page,
    context,
    extensionId,
  }) => {
    const links = [
      { title: 'First keyboard link', url: 'https://keyboard.save.test/first?view=full#section' },
      { title: 'Second keyboard link', url: 'https://keyboard.save.test/second?view=full#section' },
    ]
    await context.route('https://keyboard.save.test/**', route => {
      const link = links.find(item => item.url.split('#')[0] === route.request().url())
      return route.fulfill({ contentType: 'text/html', body: `<title>${link?.title}</title>` })
    })
    await page.goto(`chrome-extension://${extensionId}/newtab.html`)
    await page.evaluate(() =>
      chrome.storage.local.set({
        'onboarding-completed-key': true,
        'quick-url-item-storage-key': [{ id: 'keyboard', title: 'Keyboard', url: 'https://keyboard.save.test/' }],
      }),
    )
    for (const link of links) {
      const visited = await context.newPage()
      await visited.goto(link.url)
      await visited.close()
    }
    await page.reload()
    if (source === 'search') {
      await page.getByTestId('command-shortcut-history').click()
      await page.getByTestId('command-input').fill('keyboard.save.test')
    } else {
      await page.getByTestId('quick-link-card').click({ button: 'right' })
      await page.getByTestId('quick-link-history').click()
    }
    const panel = page.getByTestId(source === 'search' ? 'command-panel' : 'domain-history-dialog')
    const input = page.getByTestId(source === 'search' ? 'command-input' : 'domain-history-search')
    const rows = panel.getByTestId(source === 'search' ? 'command-result' : 'domain-history-item')
    await expect(rows).toHaveCount(2)
    await expect(input).toBeFocused()
    await input.press('ArrowDown')
    const selected = rows.and(page.locator('[aria-selected="true"]'))
    await expect(selected).toHaveCount(1)
    const selectedText = await selected.textContent()
    const selectedLink = links.find(link => selectedText?.includes(link.title))!
    const save = page.getByTestId('save-quick-link')

    await input.press('Shift+F10')
    await expect(save).toBeVisible()
    await expect(save).not.toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('Escape')
    await expect(save).toHaveCount(0)
    await expect(panel).toBeVisible()
    await expect(input).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(panel).not.toBeVisible()

    if (source === 'search') {
      await input.click()
    } else {
      await page.getByTestId('quick-link-card').click({ button: 'right' })
      await page.getByTestId('quick-link-history').click()
    }
    await input.fill(selectedLink.title)
    await expect(rows).toHaveCount(1)
    await input.press('ArrowDown')
    await expect(rows.and(page.locator('[aria-selected="true"]'))).toContainText(selectedLink.title)

    await input.press('ContextMenu')
    await expect(save).toBeVisible()
    await expect
      .poll(() => save.evaluate(element => element.closest('[role="menu"]')?.contains(document.activeElement)))
      .toBe(true)
    await page.keyboard.press('ArrowDown')
    await expect(save).toBeFocused()
    await page.keyboard.press('Enter')
    await expect
      .poll(() =>
        page.evaluate(
          async () => (await chrome.storage.local.get('quick-url-item-storage-key'))['quick-url-item-storage-key'],
        ),
      )
      .toEqual([
        { id: 'keyboard', title: 'Keyboard', url: 'https://keyboard.save.test/' },
        { id: expect.any(String), title: expect.any(String), url: selectedLink.url },
      ])
    await expect(input).toBeFocused()
    expect(page.url()).toContain('/newtab.html')
    if (source === 'search') {
      // Saving refreshes command results and may reset cmdk's virtual selection.
      await input.fill(selectedLink.title)
      await expect(rows).toHaveCount(1)
      await input.press('ArrowDown')
      await expect(rows.and(page.locator('[aria-selected="true"]'))).toContainText(selectedLink.title)
    }

    await input.press('Shift+F10')
    await expect(save).toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('Escape')
    await expect(save).toHaveCount(0)
    await expect(panel).toBeVisible()
    await expect(input).toBeFocused()
    if (source === 'domain history') await expect(page.getByRole('dialog')).toHaveAttribute('data-open', '')
    await page.keyboard.press('Escape')
    await expect(panel).not.toBeVisible()
  })
}

test('saving a site recent page keeps its row and keyboard focus until the dialog is reopened', async ({
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
  const row = dialog.locator(`[data-page-url="${url}"]`)
  const group = row.locator('xpath=ancestor::section').locator('h3')
  const save = page.getByTestId('save-quick-link')
  const primary = row.locator('.nt-return-open')
  const recentGroup = await group.textContent()
  await row.click({ button: 'right' })
  await save.press('Enter')
  await expect(primary).toBeFocused()
  await expect(primary).toBeInViewport()
  await expect(group).toHaveText(recentGroup!)
  // External storage changes update the button without regrouping the opened list.
  await page.evaluate(async value => {
    const key = 'quick-url-item-storage-key'
    const links = (await chrome.storage.local.get(key))[key]
    await chrome.storage.local.set({ [key]: links.filter((item: { url: string }) => item.url !== value) })
  }, url)
  await row.click({ button: 'right' })
  await expect(save).not.toHaveAttribute('aria-disabled', 'true')
  await save.press('Enter')
  await primary.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.getByTestId('quick-link-card').first().locator('.nt-link-expand').click()
  await expect(group).not.toHaveText(recentGroup!)
  await row.click({ button: 'right' })
  await expect(save).toHaveAttribute('aria-disabled', 'true')
})
