import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

test.use({ extensionLocale: 'zh-CN' })

async function prepare(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      'onboarding-completed-key': true,
      'settings-storage': { autoFocusCommandInput: false, showRecentPages: false },
    })
  })
  await page.reload()
  await expect(page.getByTestId('command-input')).toBeVisible()
}

for (const source of ['history', 'bookmarks', 'tabs'] as const) {
  for (const gesture of ['Enter', 'Control+Enter', 'modifier-click'] as const) {
    test(`${source}: ${gesture} retains failed selection and waits for successful retry`, async ({
      page,
      extensionId,
    }, testInfo) => {
      await prepare(page, extensionId)
      await page.evaluate(source => {
        const item = {
          id: source === 'tabs' ? 42 : '42',
          windowId: 1,
          title: 'Recoverable target',
          url: 'https://feedback.example/target',
        }
        const api = source === 'history' ? chrome.history : source === 'bookmarks' ? chrome.bookmarks : chrome.tabs
        Object.defineProperty(api, source === 'tabs' ? 'query' : 'search', { value: async () => [item] })
        let attempts = 0
        const open = () => {
          attempts++
          sessionStorage.setItem('open-attempts', String(attempts))
          if (attempts === 1) return Promise.reject(new Error('Test: browser operation failed'))
          return new Promise(resolve => window.addEventListener('finish-open', () => resolve({}), { once: true }))
        }
        Object.defineProperty(chrome.tabs, 'update', { value: open })
        Object.defineProperty(chrome.tabs, 'create', { value: open })
        Object.defineProperty(chrome.windows, 'update', { value: async () => ({}) })
      }, source)
      await page.getByTestId(`command-shortcut-${source}`).first().click()
      const input = page.getByTestId('command-input')
      await input.fill('Recoverable')
      const target = page.locator('[data-command-result-id="42"]')
      await expect(target).toHaveAttribute('aria-selected', 'true')
      const activate = () =>
        gesture === 'modifier-click' ? target.click({ modifiers: ['Control'] }) : input.press(gesture)
      await activate()
      await expect(page.getByText('无法打开页面，请重试。')).toBeVisible()
      await expect(input).toHaveValue('Recoverable')
      await expect(target).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByTestId('command-panel')).toBeVisible()
      if (source === 'history' && gesture === 'Enter')
        await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('search-open-failed.png') })
      await activate()
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('open-attempts'))).toBe('2')
      await activate()
      expect(await page.evaluate(() => sessionStorage.getItem('open-attempts'))).toBe('2')
      await expect(page.getByTestId('command-panel')).toBeVisible()
      await page.evaluate(() => window.dispatchEvent(new Event('finish-open')))
      await expect(page.getByTestId('command-panel')).toHaveCount(0)
      if (source === 'history' && gesture === 'Enter')
        await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('search-open-recovered.png') })
    })
  }
}

test('tab URL-only and mixed-term matches retain separate real tabs', async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await context.route('https://feedback.example/**', route =>
    route.fulfill({ contentType: 'text/html', body: '<title>Ordinary title</title>' }),
  )
  await prepare(page, extensionId)
  // Attach Playwright before navigation so the synthetic URL's first request is routed.
  // Native tabs.create can begin that request before context interception attaches.
  for (let index = 0; index < 2; index++) {
    const target = await context.newPage()
    await target.goto('https://feedback.example/url-only-token')
    await expect(target).toHaveTitle('Ordinary title')
  }
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await chrome.tabs.query({})).filter(
            tab => tab.url === 'https://feedback.example/url-only-token' && tab.title === 'Ordinary title',
          ).length,
      ),
    )
    .toBe(2)
  await page.bringToFront()
  await page.getByTestId('command-shortcut-tabs').first().click()
  const input = page.getByTestId('command-input')
  await input.fill('URL-ONLY-TOKEN')
  await expect(page.getByTestId('command-result')).toHaveCount(2)
  await input.fill(' ordinary URL-ONLY-TOKEN ')
  await expect(page.getByTestId('command-result')).toHaveCount(2)
  const duplicates = await page.evaluate(async () =>
    (await chrome.tabs.query({})).filter(tab => tab.url === 'https://feedback.example/url-only-token'),
  )
  for (const tab of duplicates) {
    await expect(page.locator(`[data-command-result-id="${tab.id}"]`)).toContainText(`标签页 ${tab.index + 1}`)
  }
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('duplicate-tab-location.png') })
  await page.evaluate(async id => {
    await chrome.tabs.move(id, { index: 0 })
  }, duplicates[1].id!)
  await input.fill('URL-ONLY-TOKEN')
  await expect(page.locator(`[data-command-result-id="${duplicates[1].id}"]`)).toContainText('标签页 1')
  await expect(page.getByTestId('command-result')).toHaveCount(2)
})

test('bookmark continuation reaches beyond ten, paginates and remains reachable on small screens', async ({
  page,
  extensionId,
}, testInfo) => {
  await prepare(page, extensionId)
  await page.evaluate(async () => {
    for (let index = 0; index < 35; index++)
      await chrome.bookmarks.create({
        title: `Feedback bookmark ${String(index).padStart(2, '0')}`,
        url: `https://feedback.example/${index}`,
      })
  })
  await page.getByTestId('command-shortcut-bookmarks').first().click()
  await page.getByTestId('command-input').fill('Feedback bookmark')
  await expect(page.getByTestId('command-result')).toHaveCount(10)
  await expect(page.locator('[data-command-action-id="bookmarks-more"]')).toBeInViewport()
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('search-bookmarks-continuation.png') })
  await page.locator('[data-command-action-id="bookmarks-more"]').click()
  const dialog = page.getByTestId('search-results-dialog')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(20)
  await expect(dialog.locator('.nt-navigation-pagination')).toContainText('共 35 条')
  await dialog.getByRole('button', { name: '下一页' }).click()
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(15)
  await expect(dialog.locator('.nt-navigation-open').first()).toBeFocused()
  await dialog.getByRole('textbox').fill('Feedback bookmark 34')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(1)
  await dialog.getByRole('textbox').fill('Feedback bookmark')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(20)
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 700 },
    { width: 900, height: 360 },
  ]) {
    await page.setViewportSize(viewport)
    await expect(dialog.getByRole('textbox')).toBeInViewport()
    await expect(dialog.locator('.nt-navigation-pagination')).toBeInViewport()
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`search-results-${viewport.width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => chrome.storage.local.set({ 'theme-storage-key': 'dark' }))
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('search-results-dark.png') })
  await dialog.getByRole('textbox').press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('command-input')).toBeFocused()
})

test('history continuation is bounded and rejects late queries, with recoverable read errors', async ({
  page,
  extensionId,
}, testInfo) => {
  await prepare(page, extensionId)
  await page.evaluate(() => {
    const rows = (text: string, count: number) =>
      Array.from({ length: count }, (_, id) => ({
        id: String(id),
        title: `${text} match ${id}`,
        url: `https://feedback.example/${text}/${id}`,
      }))
    let fail = true
    Object.defineProperty(chrome.history, 'search', {
      value: (query: chrome.history.HistoryQuery) => {
        const calls = JSON.parse(sessionStorage.getItem('history-calls') || '[]')
        calls.push(query)
        sessionStorage.setItem('history-calls', JSON.stringify(calls))
        if (query.maxResults === 11) return Promise.resolve(rows(query.text, 11))
        if (query.text === 'older')
          return new Promise(resolve =>
            window.addEventListener('finish-old-query', () => resolve(rows('older', 25)), { once: true }),
          )
        if (query.text === 'retry' && fail) {
          fail = false
          return Promise.reject(new Error('Test: history read failed'))
        }
        return Promise.resolve(rows(query.text, query.text === 'recent' ? 1000 : 1))
      },
    })
  })
  await page.getByTestId('command-shortcut-history').first().click()
  await page.getByTestId('command-input').fill('recent')
  await expect(page.locator('[data-command-action-id="history-more"]')).toBeVisible()
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('history-calls')!).every(
        (call: { maxResults: number }) => call.maxResults === 11,
      ),
    ),
  ).toBe(true)
  await page.locator('[data-command-action-id="history-more"]').click()
  const dialog = page.getByTestId('search-results-dialog')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(20)
  await expect(dialog).toContainText('不是全部历史')
  await expect(dialog.locator('.nt-navigation-pagination')).toContainText('共 1000 条')
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('search-history-bounded.png') })
  await dialog.getByRole('textbox').fill('older')
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(sessionStorage.getItem('history-calls')!).some((call: { text: string }) => call.text === 'older'),
      ),
    )
    .toBe(true)
  await dialog.getByRole('textbox').fill('newest')
  await expect(dialog.getByTestId('navigation-row')).toContainText('newest match')
  await page.evaluate(() => window.dispatchEvent(new Event('finish-old-query')))
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(1)
  await expect(dialog.getByTestId('navigation-row')).toContainText('newest match')
  await dialog.getByRole('textbox').fill('retry')
  await expect(dialog.getByRole('alert')).toBeVisible()
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('search-history-read-failed.png') })
  await dialog.getByRole('button', { name: '重试', exact: true }).click()
  await expect(dialog.getByTestId('navigation-row')).toContainText('retry match')
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('history-calls')!).every(
        (call: { maxResults: number }) => call.maxResults <= 1000,
      ),
    ),
  ).toBe(true)
})

test('synchronous retry commands keep the panel open and a completed old action cannot dismiss a newer query', async ({
  page,
  extensionId,
}) => {
  await prepare(page, extensionId)
  await page.evaluate(() => {
    let failed = false
    Object.defineProperty(chrome.history, 'search', {
      value: async () => {
        if (!failed) {
          failed = true
          throw new Error('Test: initial history read failed')
        }
        return [{ id: 'old', title: 'Recoverable history', url: 'https://feedback.example/old' }]
      },
    })
    Object.defineProperty(chrome.tabs, 'create', {
      value: () =>
        new Promise(resolve => window.addEventListener('finish-old-open', () => resolve({}), { once: true })),
    })
  })
  await page.getByTestId('command-shortcut-history').first().click()
  const retry = page.locator('[data-command-result-id="retry-history"]')
  await expect(retry).toBeVisible()
  await retry.click()
  await expect(page.getByTestId('command-panel')).toBeVisible()
  await expect(page.locator('[data-command-result-id="old"]')).toBeVisible()
  const input = page.getByTestId('command-input')
  await input.press('Control+Enter')
  await input.fill('newer query')
  await expect(page.getByTestId('command-result')).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('finish-old-open')))
  await expect(input).toHaveValue('newer query')
  await expect(page.getByTestId('command-panel')).toBeVisible()
})

for (const source of ['history', 'bookmarks'] as const) {
  test(`${source}: heading continuation is visible, keyboard reachable and never the default result`, async ({
    page,
    extensionId,
  }, testInfo) => {
    await prepare(page, extensionId)
    await page.evaluate(source => {
      const rows = Array.from({ length: 12 }, (_, index) => ({
        id: String(index),
        title: `Heading target ${index}`,
        url: `https://heading.example/${index}`,
      }))
      const api = source === 'history' ? chrome.history : chrome.bookmarks
      Object.defineProperty(api, 'search', { value: async () => rows })
      if (source === 'bookmarks') Object.defineProperty(chrome.bookmarks, 'getRecent', { value: async () => rows })
    }, source)
    await page.getByTestId(`command-shortcut-${source}`).first().click()
    const input = page.getByTestId('command-input')
    await input.fill('Heading')
    const results = page.getByTestId('command-result')
    const more = page.locator(`[data-command-action-id="${source}-more"]`)
    await expect(results).toHaveCount(10)
    await expect(
      page.getByRole('group', { name: source === 'history' ? '历史记录' : '书签', exact: true }),
    ).toHaveCount(1)
    await expect(results.first()).toHaveAttribute('aria-selected', 'true')
    await expect(more).toHaveCount(1)
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 700 },
      { width: 900, height: 360 },
    ]) {
      await page.setViewportSize(viewport)
      await expect(more).toBeInViewport({ ratio: 1 })
      await expect(page.getByTestId('command-new-tab-hint')).toBeInViewport({ ratio: 1 })
      expect(await page.getByTestId('command-results').evaluate(el => el.scrollTop)).toBe(0)
      await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`heading-${source}-${viewport.width}.png`),
      })
    }
    await input.press('ArrowDown')
    await expect(results.nth(1)).toHaveAttribute('aria-selected', 'true')
    await input.press('ArrowUp')
    await expect(results.first()).toHaveAttribute('aria-selected', 'true')
    await input.press('Tab')
    await expect(more).toBeFocused()
    await more.press('Enter')
    await expect(page.getByTestId('search-results-dialog')).toBeVisible()
    await expect(page.getByTestId('search-results-dialog').getByRole('textbox')).toHaveValue('Heading')
  })
}

for (const mac of [false, true]) {
  test(`new-tab hint follows selected result capability (${mac ? 'macOS' : 'Windows'})`, async ({
    page,
    extensionId,
  }, testInfo) => {
    await page.addInitScript(
      mac =>
        Object.defineProperty(navigator, 'userAgent', {
          get: () =>
            mac ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        }),
      mac,
    )
    await prepare(page, extensionId)
    await page.evaluate(async () => {
      await chrome.bookmarks.create({ title: '1+1 first', url: 'https://hint.example/first' })
      await chrome.bookmarks.create({ title: '1+1 second', url: 'https://hint.example/second' })
      await chrome.storage.local.set({
        'command-settings-storage': {
          bookmarks: { active: true, includeInGlobal: true, priority: 0, activeKey: 'b' },
          calculator: { active: true, includeInGlobal: true, priority: 1, activeKey: 'c' },
          webSearch: { active: false },
          quickLinks: { active: false },
          tabs: { active: false },
          history: { active: false },
          numberToRmb: { active: false },
        },
      })
    })
    await page.reload()
    const input = page.getByTestId('command-input')
    await input.fill('1+1')
    const results = page.getByTestId('command-result')
    await expect(results).toHaveCount(3)
    // Resolver groups arrive asynchronously: calculator may finish before native bookmark search.
    // Select the bookmark farthest from calculator so a single-row fallback cannot pass.
    const titles = await results.allTextContents()
    const calculatorIndex = titles.findIndex(title => title.includes('1+1 = 2'))
    const bookmarkIndex = calculatorIndex === 0 ? 2 : 0
    expect(titles[bookmarkIndex]).toContain('https://hint.example/')
    expect(bookmarkIndex).toBeGreaterThanOrEqual(0)
    expect(calculatorIndex).toBeGreaterThanOrEqual(0)
    await input.press('Home')
    for (let index = 0; index < bookmarkIndex; index++) await input.press('ArrowDown')
    await expect(results.nth(bookmarkIndex)).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('command-new-tab-hint')).toContainText(mac ? '⌘+Enter' : 'Ctrl+Enter')
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`new-tab-hint-${mac ? 'mac' : 'windows'}.png`),
    })
    const towardCalculator = calculatorIndex < bookmarkIndex ? 'Alt+ArrowUp' : 'Alt+ArrowDown'
    await input.press(towardCalculator)
    await expect(page.locator('[data-command-result-id="calc-result"]')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('command-new-tab-hint')).toHaveCount(0)
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('calculator-no-new-tab-hint.png') })
    await input.press(calculatorIndex < bookmarkIndex ? 'Alt+ArrowDown' : 'Alt+ArrowUp')
    await expect(page.getByTestId('command-new-tab-hint')).toBeVisible()
  })
}
