import type { Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from './fixtures'

declare global {
  interface Window {
    popupTest: {
      historyCalls: number
      tabQueries: number
      failHistory: boolean
      closed: boolean
      switched: number[]
      opened: chrome.tabs.CreateProperties[]
      historyResolve: null | ((items: chrome.history.HistoryItem[]) => void)
    }
  }
}

test.use({ extensionLocale: 'zh-CN' })
const savedKey = 'quick-url-item-storage-key'
const current = {
  id: 10001,
  url: 'https://popup.example/project',
  title: 'Current project',
  windowId: 1,
  index: 0,
  incognito: false,
}
const tabs = Array.from({ length: 25 }, (_, i) => ({
  ...current,
  id: 10002 + i,
  index: i + 1,
  url: `https://popup.example/open/${i}?ref=tab#section`,
  title: `Opened page ${i}`,
  favIconUrl: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="${i % 2 ? 'blue' : 'red'}"/></svg>`)}`,
}))
const history = Array.from({ length: 25 }, (_, i) => ({
  id: String(i),
  url: `https://popup.example/history/${i}?query=one#section`,
  title: `Recent page ${i}：较长的标题，检查截断与键盘操作`,
  lastVisitTime: Date.now() - i * 60_000,
}))

async function prepare(
  page: Page,
  extensionId: string,
  options: { private?: boolean; failHistory?: boolean; delayHistory?: boolean; many?: boolean } = {},
) {
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await page.evaluate(
    key =>
      chrome.storage.local.set({
        [key]: Array.from({ length: 35 }, (_, i) => ({
          id: String(i),
          title: `Saved ${i}`,
          url: `https://saved.example/page?q=${i}`,
        })),
        'settings-storage': { showRecentPages: false },
      }),
    savedKey,
  )
  await page.addInitScript(
    ({ current, tabs, history, options }) => {
      const state = {
        historyCalls: 0,
        tabQueries: 0,
        failHistory: options.failHistory ?? false,
        closed: false,
        switched: [] as number[],
        opened: [] as chrome.tabs.CreateProperties[],
        historyResolve: null as null | ((items: chrome.history.HistoryItem[]) => void),
      }
      Object.assign(window, { popupTest: state })
      Object.defineProperty(window, 'close', {
        value: () => {
          state.closed = true
        },
      })
      Object.defineProperty(chrome.tabs, 'query', {
        value: async (query: chrome.tabs.QueryInfo) => {
          if (query.active) return [{ ...current, incognito: Boolean(options.private) }]
          state.tabQueries++
          if (options.many)
            return Array.from({ length: 1000 }, (_, i) => ({
              ...tabs[0],
              id: 20000 + i,
              url: `https://popup.example/many/${i}`,
              title: `Many tab ${i}`,
            }))
          return [
            ...tabs.map(tab => ({ ...tab, incognito: Boolean(options.private) })),
            { ...tabs[0], id: 9999, incognito: !options.private },
            { ...tabs[0], id: 9998, url: 'https://sub.popup.example/nope' },
          ]
        },
      })
      Object.defineProperty(chrome.tabs, 'get', {
        value: async (id: number) => {
          const tab = id === current.id ? current : tabs.find(tab => tab.id === id)
          if (!tab) throw Error('Missing tab')
          return { ...tab, incognito: Boolean(options.private) }
        },
      })
      Object.defineProperty(chrome.tabs, 'update', {
        value: async (id: number) => {
          state.switched.push(id)
        },
      })
      Object.defineProperty(chrome.windows, 'update', { value: async () => ({}) })
      Object.defineProperty(chrome.tabs, 'create', {
        value: async (properties: chrome.tabs.CreateProperties) => {
          state.opened.push(properties)
        },
      })
      Object.defineProperty(chrome.history, 'search', {
        value: async () => {
          state.historyCalls++
          if (state.failHistory) throw Error('History unavailable')
          if (options.delayHistory)
            return new Promise<chrome.history.HistoryItem[]>(resolve => {
              state.historyResolve = resolve
            })
          return [...history, { id: 'other', url: 'https://other.example/not-related', title: 'Not related' }]
        },
      })
    },
    { current, tabs, history, options },
  )
  await page.reload()
  await expect(page.getByTestId('popup-quick-link')).toHaveCount(8)
}

test('balanced popup searches every candidate, scrolls and keeps the first screen compact', async ({
  page,
  extensionId,
}) => {
  await prepare(page, extensionId)
  await expect(page.getByTestId('popup-page-row')).toHaveCount(4)
  await expect(page.getByTestId('popup-page-row').nth(0)).toContainText('Opened page 0')
  await expect(page.getByTestId('popup-page-row').nth(2)).toContainText('Recent page 0')
  await expect(page.getByTestId('popup-page-row').nth(0).locator('img')).toHaveAttribute('src', tabs[0].favIconUrl)
  await expect(page.getByTestId('popup-page-row').nth(1).locator('img')).toHaveAttribute('src', tabs[1].favIconUrl)
  await expect(page.getByTestId('popup-page-row').nth(2).locator('[data-icon-status]')).toHaveAttribute(
    'data-icon-status',
    /fallback|loaded/,
  )
  const folder = path.resolve('artifacts/requirements/popup-exploration')
  await mkdir(folder, { recursive: true })
  for (const [width, height] of [
    [480, 700],
    [320, 700],
    [480, 360],
  ]) {
    await page.setViewportSize({ width, height })
    await expect(page.locator('.popup-search')).toBeInViewport()
    await expect(page.locator('.popup-toolbar')).toBeInViewport()
    expect(await page.locator('.popup-container').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    if (height > 540)
      expect(await page.locator('.popup-content').evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true)
    await page.locator('.popup-container').screenshot({ path: path.join(folder, `implemented-${width}-${height}.png`) })
  }
  await page.setViewportSize({ width: 480, height: 700 })
  await page.evaluate(() => chrome.storage.local.set({ 'theme-storage-key': 'dark' }))
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.locator('.popup-container').screenshot({ path: path.join(folder, 'implemented-dark.png') })
  await page.getByRole('region', { name: '常用网站', exact: true }).getByRole('button', { name: '查看全部' }).click()
  await expect(page.getByTestId('popup-quick-link')).toHaveCount(35)
  await expect(page.getByRole('button', { name: '下一页' })).toHaveCount(0)
  await page.locator('.popup-content').evaluate(element => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByTestId('popup-quick-link').last()).toBeInViewport()
  await expect(page.locator('.popup-list-heading')).toBeInViewport()
  await page.locator('.popup-container').screenshot({ path: path.join(folder, 'implemented-scroll-saved.png') })
  await page.getByRole('searchbox').fill('q=34')
  await expect(page.getByTestId('popup-page-row')).toHaveCount(1)
  await expect(page.getByTestId('popup-page-row')).toHaveText(/Saved 34/)
  await page.getByRole('searchbox').fill('Saved')
  await expect(page.locator('.popup-content')).toHaveAttribute('data-total', '35')
  expect(await page.getByTestId('popup-page-row').count()).toBeLessThanOrEqual(20)
  await expect(page.getByTestId('popup-page-row').first()).toContainText('Saved 0')
  await page.getByRole('searchbox').fill('history/24')
  await expect(page.getByTestId('popup-page-row')).toHaveCount(1)
  await expect(page.getByTestId('popup-page-row')).toContainText('Recent page 24')
  await page.getByRole('searchbox').press('Escape')
  await expect(page.getByTestId('popup-quick-link')).toHaveCount(8)
  expect(await page.evaluate(() => window.popupTest.historyCalls)).toBe(1)
  expect(await page.evaluate(() => window.popupTest.tabQueries)).toBe(1)
})

test('long popup lists scroll to the end with bounded mounting and keyboard access', async ({ page, extensionId }) => {
  await prepare(page, extensionId, { many: true })
  await page.getByRole('region', { name: '当前站点', exact: true }).getByRole('button', { name: '查看全部' }).click()
  const content = page.locator('.popup-content')
  await expect(content).toHaveAttribute('data-total', '1025')
  expect(await page.getByTestId('popup-page-row').count()).toBeLessThanOrEqual(20)
  await page.getByRole('searchbox').press('ArrowDown')
  await expect(page.locator('[data-popup-index="0"]')).toBeFocused()
  await page.locator('[data-popup-index="0"]').press('End')
  await expect(page.locator('[data-popup-index="1024"]')).toBeFocused()
  await expect(page.locator('[data-popup-index="1024"]')).toBeInViewport()
  expect(await page.getByTestId('popup-page-row').count()).toBeLessThanOrEqual(20)
  await page.locator('[data-popup-index="1024"]').press('ArrowUp')
  await expect(page.locator('[data-popup-index="1023"]')).toBeFocused()
  await content.evaluate(element => {
    element.scrollTop = 0
  })
  await expect(page.locator('[data-popup-index="0"]')).toBeInViewport()
  await expect(page.locator('[data-popup-index="1023"]')).toBeFocused()
  await content.hover()
  await page.mouse.wheel(0, 600)
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  await page.getByRole('searchbox').fill('many/999')
  await expect(page.getByTestId('popup-page-row')).toHaveCount(1)
  expect(await content.evaluate(el => el.scrollTop)).toBe(0)
  await page.getByRole('searchbox').press('Escape')
  await page.evaluate(
    key =>
      chrome.storage.local.set({
        [key]: Array.from({ length: 1000 }, (_, i) => ({
          id: String(i),
          title: `Saved ${i}`,
          url: `https://saved.example/page?q=${i}`,
        })),
      }),
    savedKey,
  )
  await page.getByRole('region', { name: '常用网站', exact: true }).getByRole('button', { name: '查看全部' }).click()
  expect(await page.getByTestId('popup-quick-link').count()).toBeLessThanOrEqual(60)
  await page.getByRole('searchbox').press('ArrowDown')
  await page.locator('[data-popup-index="0"]').press('End')
  await expect(page.locator('[data-popup-index="999"]')).toBeFocused()
  await expect(page.locator('[data-popup-index="999"]')).toBeInViewport()
  await page.setViewportSize({ width: 320, height: 360 })
  await expect(page.getByRole('searchbox')).toBeInViewport()
  await expect(page.locator('.popup-toolbar')).toBeInViewport()
  await expect(page.locator('[data-popup-index="999"]')).toBeFocused()
  await expect(page.locator('[data-popup-index="999"]')).toBeInViewport()
  await page.locator('[data-popup-index="999"]').press('Home')
  await expect(page.locator('[data-popup-index="0"]')).toBeFocused()
  await expect(page.locator('[data-popup-index="0"]')).toBeInViewport()
  await page
    .locator('.popup-container')
    .screenshot({ path: path.resolve('artifacts/requirements/popup-exploration/implemented-scroll-narrow-short.png') })
  expect(await page.getByTestId('popup-quick-link').count()).toBeLessThanOrEqual(60)
})

test('popup keyboard actions preserve tab IDs and open full URLs in new tabs', async ({ page, extensionId }) => {
  await prepare(page, extensionId)
  const search = page.getByRole('searchbox')
  await search.fill('open/24')
  await search.press('ArrowDown')
  await expect(page.getByTestId('popup-page-row')).toBeFocused()
  await page.getByTestId('popup-page-row').press('Enter')
  expect(await page.evaluate(() => window.popupTest.switched)).toEqual([10026])
  await search.fill('history/24')
  await search.press('Control+Enter')
  expect(await page.evaluate(() => window.popupTest.opened)).toEqual([
    { url: history[24].url, active: true, windowId: 1 },
  ])
  await search.fill('q=34')
  await search.press('Control+Shift+Enter')
  expect(await page.evaluate(() => window.popupTest.opened.at(-1))).toEqual({
    url: 'https://saved.example/page?q=34',
    active: true,
    windowId: 1,
    index: 1,
  })
})

test('popup switches an actual browser tab and opens saved links without replacing the opener', async ({
  page,
  context,
  extensionId,
}) => {
  await context.route('https://popup.example/**', route =>
    route.fulfill({ contentType: 'text/html', body: '<title>Project page</title>' }),
  )
  const opener = await context.newPage()
  await opener.goto('https://popup.example/project')
  const target = await context.newPage()
  await target.goto('https://popup.example/issues?q=actual#section')
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  const captured = await page.evaluate(async () =>
    (await chrome.tabs.query({})).find(tab => tab.url === 'https://popup.example/project')!,
  )
  await page.evaluate(
    key =>
      chrome.storage.local.set({
        [key]: [{ id: 'real', title: 'Saved real page', url: 'https://popup.example/saved?q=actual#section' }],
      }),
    savedKey,
  )
  await page.addInitScript(captured => {
    const original = chrome.tabs.query.bind(chrome.tabs)
    Object.defineProperty(chrome.tabs, 'query', {
      value: (query: chrome.tabs.QueryInfo) => (query.active ? Promise.resolve([captured]) : original(query)),
    })
    Object.defineProperty(window, 'close', { value: () => {} })
  }, captured)
  await page.reload()
  await page.getByRole('searchbox').fill('issues?q=actual')
  await expect(page.getByTestId('popup-page-row')).toHaveCount(1)
  await page.getByTestId('popup-page-row').click()
  expect(
    await page.evaluate(async () => (await chrome.tabs.query({})).find(tab => tab.url?.includes('/issues?'))?.active),
  ).toBe(true)
  await page.getByRole('searchbox').fill('Saved real page')
  const created = context.waitForEvent('page')
  await page.getByRole('searchbox').press('Enter')
  const opened = await created
  await opened.waitForURL('https://popup.example/saved?q=actual#section')
  await expect(opener).toHaveURL('https://popup.example/project')
})

test('popup retains available results on history failure and recovers through retry', async ({ page, extensionId }) => {
  await prepare(page, extensionId, { failHistory: true })
  await expect(page.getByTestId('popup-page-row')).toHaveCount(4)
  await expect(page.locator('.popup-notice')).toContainText('读取失败')
  await page.evaluate(() => {
    window.popupTest.failHistory = false
  })
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.locator('.popup-notice')).toHaveCount(0)
  await expect(page.getByTestId('popup-page-row').nth(2)).toContainText('Recent page 0')
  await page.getByTestId('add-current-page').click()
  await expect(page.getByTestId('add-current-page')).toBeDisabled()
  expect(
    await page.evaluate(
      async key =>
        (await chrome.storage.local.get(key))[key].filter(
          (item: { url: string }) => item.url === 'https://popup.example/project',
        ).length,
      savedKey,
    ),
  ).toBe(1)
})

test('private popup never queries normal history and excludes normal tabs', async ({ page, extensionId }) => {
  await prepare(page, extensionId, { private: true })
  await expect(page.getByTestId('popup-page-row')).toHaveCount(4)
  expect(await page.evaluate(() => window.popupTest.historyCalls)).toBe(0)
  await page.getByRole('searchbox').fill('history/')
  await expect(page.getByTestId('popup-page-row')).toHaveCount(0)
  await page.getByRole('searchbox').fill('open/0')
  await expect(page.getByTestId('popup-page-row')).toHaveCount(1)
})

test('a failed open leaves the popup available for another attempt', async ({ page, extensionId }) => {
  await prepare(page, extensionId)
  await page.evaluate(() =>
    Object.defineProperty(chrome.tabs, 'create', {
      configurable: true,
      value: async () => {
        throw Error('Create failed')
      },
    }),
  )
  await page.getByRole('searchbox').fill('q=34')
  await page.getByRole('searchbox').press('Enter')
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await page.evaluate(() => window.popupTest.closed)).toBe(false)
  await page.evaluate(() =>
    Object.defineProperty(chrome.tabs, 'create', {
      value: async (properties: chrome.tabs.CreateProperties) => {
        window.popupTest.opened.push(properties)
      },
    }),
  )
  await page.getByRole('searchbox').press('Enter')
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(() => window.popupTest.closed)).toBe(true)
  expect(await page.evaluate(() => window.popupTest.opened.length)).toBe(1)
})

test('history deletion during loading cannot restore deleted rows', async ({ page, extensionId }) => {
  await prepare(page, extensionId, { delayHistory: true })
  await expect.poll(() => page.evaluate(() => Boolean(window.popupTest.historyResolve))).toBe(true)
  await page.evaluate(() => chrome.history.deleteAll())
  await page.evaluate(history => window.popupTest.historyResolve?.(history), history)
  await expect(page.locator('.popup-content')).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('searchbox').fill('history/')
  await expect(page.getByTestId('popup-page-row')).toHaveCount(0)
})
