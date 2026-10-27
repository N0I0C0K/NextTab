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
    }) => {
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
      await activate()
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('open-attempts'))).toBe('2')
      await activate()
      expect(await page.evaluate(() => sessionStorage.getItem('open-attempts'))).toBe('2')
      await expect(page.getByTestId('command-panel')).toBeVisible()
      await page.evaluate(() => window.dispatchEvent(new Event('finish-open')))
      await expect(page.getByTestId('command-panel')).toHaveCount(0)
    })
  }
}

test('tab URL-only and mixed-term matches retain separate real tabs', async ({ page, context, extensionId }) => {
  await context.route('https://feedback.example/**', route =>
    route.fulfill({ contentType: 'text/html', body: '<title>Ordinary title</title>' }),
  )
  await prepare(page, extensionId)
  await page.evaluate(async () => {
    await chrome.tabs.create({ url: 'https://feedback.example/url-only-token', active: false })
    await chrome.tabs.create({ url: 'https://feedback.example/url-only-token', active: false })
  })
  await page.bringToFront()
  await page.getByTestId('command-shortcut-tabs').first().click()
  const input = page.getByTestId('command-input')
  await input.fill('URL-ONLY-TOKEN')
  await expect(page.getByTestId('command-result')).toHaveCount(2)
  await input.fill(' ordinary URL-ONLY-TOKEN ')
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
  await expect(page.getByTestId('command-result')).toHaveCount(11)
  await page.locator('[data-command-result-id="bookmarks-more"]').click()
  const dialog = page.getByTestId('search-results-dialog')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(20)
  await expect(dialog.locator('.nt-navigation-pagination')).toContainText('共 35 条')
  await dialog.getByRole('button', { name: '下一页' }).click()
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(15)
  await expect(dialog.locator('.nt-navigation-open').first()).toBeFocused()
  await dialog.getByRole('textbox').fill('Feedback bookmark 34')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(1)
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 700 },
    { width: 900, height: 360 },
  ]) {
    await page.setViewportSize(viewport)
    await expect(dialog.getByRole('textbox')).toBeInViewport()
    await expect(dialog.locator('.nt-navigation-pagination')).toBeInViewport()
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`search-results-${viewport.width}.png`) })
  }
  await dialog.getByRole('textbox').press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('command-input')).toBeFocused()
})

test('history continuation is bounded and rejects late queries, with recoverable read errors', async ({
  page,
  extensionId,
}) => {
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
  await expect(page.locator('[data-command-result-id="history-more"]')).toBeVisible()
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('history-calls')!).every(
        (call: { maxResults: number }) => call.maxResults === 11,
      ),
    ),
  ).toBe(true)
  await page.locator('[data-command-result-id="history-more"]').click()
  const dialog = page.getByTestId('search-results-dialog')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(20)
  await expect(dialog).toContainText('不是全部历史')
  await expect(dialog.locator('.nt-navigation-pagination')).toContainText('共 1000 条')
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
