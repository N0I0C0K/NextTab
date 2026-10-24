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
      createResolve?: () => void
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
  options: {
    private?: boolean
    failHistory?: boolean
    delayHistory?: boolean
    many?: boolean
    related?: number
    noHost?: boolean
  } = {},
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
          if (query.active)
            return [
              {
                ...current,
                incognito: Boolean(options.private),
                url: options.noHost ? 'chrome://newtab/' : current.url,
              },
            ]
          state.tabQueries++
          if (options.related !== undefined) return tabs.slice(0, options.related)
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
          if (options.related !== undefined) return []
          return [...history, { id: 'other', url: 'https://other.example/not-related', title: 'Not related' }]
        },
      })
    },
    { current, tabs, history, options },
  )
  await page.reload()
  if ((options.related === undefined && !options.noHost) || options.delayHistory)
    await expect(page.getByTestId('popup-quick-link')).toHaveCount(8)
  if (!options.delayHistory) await expect(page.locator('.popup-content')).toHaveAttribute('aria-busy', 'false')
}

test('popup and NewTab share the same brand geometry at their own display sizes', async ({ page, extensionId }) => {
  await prepare(page, extensionId)
  const mark = page.locator('svg.nt-brand-mark')
  await expect(mark).toHaveCSS('width', '16px')
  const popupMark = await mark.evaluate(element => element.outerHTML)
  const folder = path.resolve('artifacts/requirements/popup-adaptive')
  await mkdir(folder, { recursive: true })
  await page.locator('.nt-brand').screenshot({ path: path.join(folder, 'brand-popup.png') })
  await page.evaluate(() => chrome.storage.local.set({ 'onboarding-completed-key': true }))
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await expect(mark).toHaveCSS('width', '20px')
  expect(await mark.evaluate(element => element.outerHTML)).toBe(popupMark)
  await page.locator('.nt-brand').screenshot({ path: path.join(folder, 'brand-newtab.png') })
})

for (const [related, desktop, narrow] of [
  [0, 20, 12],
  [1, 20, 12],
  [2, 16, 9],
  [3, 12, 6],
  [4, 8, 6],
  [-1, 24, 18],
]) {
  test(`popup gives unused space to saved sites with ${related < 0 ? 'no host' : `${related} related pages`}`, async ({
    page,
    extensionId,
  }) => {
    await prepare(page, extensionId, { related: Math.max(0, related), noHost: related < 0 })
    const links = page.getByTestId('popup-quick-link')
    const folder = path.resolve('artifacts/requirements/popup-adaptive')
    await mkdir(folder, { recursive: true })
    for (const [width, height, count] of [
      [480, 700, desktop],
      [320, 700, narrow],
      [480, 360, related < 0 ? 12 : 8],
    ]) {
      await page.setViewportSize({ width, height })
      await expect(links).toHaveCount(count)
      if (height === 700) {
        await expect(links.last()).toBeInViewport()
        expect(await page.locator('.popup-content').evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true)
        if (related > 0) await expect(page.getByTestId('popup-page-row').last()).toBeInViewport()
      }
      await expect(page.getByRole('combobox')).toBeInViewport()
      await expect(page.locator('.popup-toolbar')).toBeInViewport()
      expect(await page.locator('.popup-container').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      await page
        .locator('.popup-container')
        .screenshot({ path: path.join(folder, `related-${related}-${width}-${height}.png`) })
    }
  })
}

test('popup keeps expanded selection through search and joins the grid to sparse site results', async ({
  page,
  extensionId,
}) => {
  await prepare(page, extensionId, { related: 1 })
  await expect(page.getByTestId('popup-quick-link')).toHaveCount(20)
  const search = page.getByRole('combobox')
  await search.press('Home')
  for (let row = 0; row < 4; row++) await search.press('ArrowDown')
  await expect(page.locator('[aria-selected="true"]')).toContainText('Saved 16')
  await search.fill('q=34')
  await expect(page.locator('[aria-selected="true"]')).toContainText('Saved 34')
  await search.press('Escape')
  await expect(page.locator('[aria-selected="true"]')).toContainText('Saved 16')
  await expect(search).toBeFocused()
  await search.press('ArrowDown')
  await expect(page.locator('[aria-selected="true"]')).toContainText('Opened page 0')
  await search.press('ArrowUp')
  await expect(page.locator('[aria-selected="true"]')).toContainText('Saved 19')
  await page.setViewportSize({ width: 320, height: 700 })
  await expect(page.getByTestId('popup-quick-link')).toHaveCount(12)
  await search.press('Home')
  for (let row = 0; row < 4; row++) await search.press('ArrowDown')
  await expect(page.locator('[aria-selected="true"]')).toContainText('Opened page 0')
  expect(await page.evaluate(() => window.popupTest.opened)).toEqual([])
})

test('popup reserves site space while loading then expands without losing selection', async ({ page, extensionId }) => {
  await prepare(page, extensionId, { related: 1, delayHistory: true })
  const search = page.getByRole('combobox')
  await search.press('Home')
  await search.press('ArrowDown')
  await expect(page.locator('[aria-selected="true"]')).toContainText('Saved 4')
  await page.evaluate(() => window.popupTest.historyResolve?.([]))
  await expect(page.getByTestId('popup-quick-link')).toHaveCount(20)
  await expect(page.locator('[aria-selected="true"]')).toContainText('Saved 4')
  await expect(search).toBeFocused()
})

for (const view of ['preview', 'saved', 'site']) {
  test(`popup search restores wheel position with an offscreen selection in ${view}`, async ({ page, extensionId }) => {
    await prepare(page, extensionId, { many: view === 'site' })
    await page.setViewportSize({ width: 480, height: 360 })
    const search = page.getByRole('combobox')
    if (view !== 'preview') await search.press(view === 'saved' ? 'Alt+1' : 'Alt+2')
    await search.press('Home')
    const content = page.locator('.popup-content')
    await content.evaluate(element => {
      element.scrollTop = 150
    })
    await expect.poll(() => content.evaluate(element => element.scrollTop)).toBe(150)
    await search.fill('q=34')
    await expect(page.locator('[aria-selected="true"]')).toContainText('Saved 34')
    await search.press('Escape')
    await expect(page.locator('[aria-selected="true"]')).toContainText(view === 'site' ? 'Many tab 0' : 'Saved 0')
    await expect.poll(() => content.evaluate(element => element.scrollTop)).toBe(150)
    await expect(search).toBeFocused()
    await search.press('ArrowDown')
    await expect(page.locator('[aria-selected="true"]')).toContainText(view === 'site' ? 'Many tab 1' : 'Saved 4')
    await expect.poll(() => content.evaluate(element => element.scrollTop)).toBeLessThan(150)
  })
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
  const folder = path.resolve('artifacts/requirements/popup-keyboard')
  await mkdir(folder, { recursive: true })
  for (const [width, height] of [
    [480, 700],
    [320, 700],
    [480, 360],
  ]) {
    await page.setViewportSize({ width, height })
    await expect(page.getByTestId('popup-quick-link')).toHaveCount(width <= 380 ? 6 : 8)
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
  await page.getByRole('combobox').fill('q=34')
  await expect(page.getByTestId('popup-page-row')).toHaveCount(1)
  await expect(page.getByTestId('popup-page-row')).toHaveText(/Saved 34/)
  await page.getByRole('combobox').fill('Saved')
  await expect(page.locator('.popup-content')).toHaveAttribute('data-total', '35')
  expect(await page.getByTestId('popup-page-row').count()).toBeLessThanOrEqual(20)
  await expect(page.getByTestId('popup-page-row').first()).toContainText('Saved 0')
  await page.getByRole('combobox').fill('history/24')
  await expect(page.getByTestId('popup-page-row')).toHaveCount(1)
  await expect(page.getByTestId('popup-page-row')).toContainText('Recent page 24')
  await page.getByRole('combobox').press('Escape')
  await expect(page.getByTestId('popup-quick-link')).toHaveCount(35)
  await page.getByRole('combobox').press('Escape')
  await expect(page.getByTestId('popup-quick-link')).toHaveCount(8)
  expect(await page.evaluate(() => window.popupTest.historyCalls)).toBe(1)
  expect(await page.evaluate(() => window.popupTest.tabQueries)).toBe(1)
})

test('popup View all shortcuts connect search, full lists and Escape from any control', async ({
  page,
  extensionId,
}) => {
  await prepare(page, extensionId)
  const search = page.getByRole('combobox')
  const popup = page.locator('.popup-container')
  const content = page.locator('.popup-content')
  await expect(page.locator('[aria-keyshortcuts="Alt+1"]')).toContainText('Alt 1')
  await expect(page.locator('[aria-keyshortcuts="Alt+2"]')).toContainText('Alt 2')
  await search.fill('history/24')
  await search.press('Alt+1')
  await expect(popup).toHaveAttribute('data-view', 'saved')
  await expect(content).toHaveAttribute('data-total', '35')
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused()
  await search.press('End')
  await expect(page.locator('[aria-selected="true"]')).toContainText('Saved 34')
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  await search.press('Alt+1')
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBe(0)
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(0)
  await search.press('Escape')
  await expect(popup).toHaveAttribute('data-view', 'home')
  await page.getByTestId('add-current-page').focus()
  await page.keyboard.press('Alt+2')
  await expect(popup).toHaveAttribute('data-view', 'site')
  await expect(content).toHaveAttribute('data-total', '50')
  await expect(search).toBeFocused()
  await search.press('ArrowDown')
  await expect(page.locator('[aria-selected="true"]')).toContainText('Opened page 0')
  await search.press('Alt+1')
  await expect(popup).toHaveAttribute('data-view', 'saved')
  await search.press('Escape')
  await page.getByRole('button', { name: '快捷键说明', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('查看全部常用网站')
  await expect(dialog).toContainText('查看当前站点全部页面')
  await page.keyboard.press('Alt+2')
  await expect(popup).toHaveAttribute('data-view', 'home')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => window.popupTest.closed)).toBe(false)
  expect(await page.evaluate(() => window.popupTest.opened)).toEqual([])
  expect(await page.evaluate(() => window.popupTest.switched)).toEqual([])
})

test('popup View all shortcuts handle Option characters and absent site context', async ({ page, extensionId }) => {
  await prepare(page, extensionId)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Macintosh' })
    Object.defineProperty(chrome.tabs, 'query', { value: async () => [{ id: 10001, url: 'chrome://newtab/' }] })
  })
  await page.reload()
  const search = page.getByRole('combobox')
  const popup = page.locator('.popup-container')
  await expect(page.locator('[aria-keyshortcuts="Alt+1"]')).toContainText('Option 1')
  await search.press('Alt+2')
  await expect(popup).toHaveAttribute('data-view', 'home')
  await search.fill('Saved')
  await search.press('Alt+Shift+1')
  await expect(popup).toHaveAttribute('data-view', 'home')
  await search.evaluate(el =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '¡', code: 'Digit1', altKey: true, bubbles: true })),
  )
  await expect(popup).toHaveAttribute('data-view', 'saved')
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused()
  await search.press('Escape')
  await page.evaluate(key => chrome.storage.local.set({ [key]: [] }), savedKey)
  await expect(page.getByTestId('popup-quick-link')).toHaveCount(0)
  await search.press('Alt+1')
  await expect(popup).toHaveAttribute('data-view', 'saved')
  await expect(page.locator('.popup-empty')).toBeVisible()
})

test('long popup lists scroll to the end with bounded mounting and keyboard access', async ({ page, extensionId }) => {
  await prepare(page, extensionId, { many: true })
  await page.getByRole('region', { name: '当前站点', exact: true }).getByRole('button', { name: '查看全部' }).click()
  const content = page.locator('.popup-content')
  await expect(content).toHaveAttribute('data-total', '1025')
  expect(await page.getByTestId('popup-page-row').count()).toBeLessThanOrEqual(20)
  await page.getByRole('combobox').press('ArrowDown')
  await expect(page.getByRole('combobox')).toBeFocused()
  await expect(page.locator('[data-popup-index="0"]')).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('combobox').press('End')
  await expect(page.locator('[data-popup-index="1024"]')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-popup-index="1024"]')).toBeInViewport()
  expect(await page.getByTestId('popup-page-row').count()).toBeLessThanOrEqual(20)
  await page.getByRole('combobox').press('ArrowUp')
  await expect(page.locator('[data-popup-index="1023"]')).toHaveAttribute('aria-selected', 'true')
  await content.evaluate(element => {
    element.scrollTop = 0
  })
  await expect(page.locator('[data-popup-index="0"]')).toBeInViewport()
  await expect(page.locator('[data-popup-index="1023"]')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('combobox')).toBeFocused()
  await content.hover()
  await page.mouse.wheel(0, 600)
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  await page.getByRole('combobox').fill('many/999')
  await expect(page.getByTestId('popup-page-row')).toHaveCount(1)
  expect(await content.evaluate(el => el.scrollTop)).toBe(0)
  await page.getByRole('combobox').press('Escape')
  await expect(page.locator('[data-popup-index="1023"]')).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('combobox').press('Escape')
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
  await page.getByRole('combobox').press('ArrowDown')
  await page.getByRole('combobox').press('End')
  await expect(page.locator('[data-popup-index="999"]')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-popup-index="999"]')).toBeInViewport()
  await page.setViewportSize({ width: 320, height: 360 })
  await expect(page.getByRole('combobox')).toBeInViewport()
  await expect(page.locator('.popup-toolbar')).toBeInViewport()
  await expect(page.locator('[data-popup-index="999"]')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('combobox')).toBeFocused()
  await expect(page.locator('[data-popup-index="999"]')).toBeInViewport()
  await page.getByRole('combobox').press('Home')
  await expect(page.locator('[data-popup-index="0"]')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-popup-index="0"]')).toBeInViewport()
  await page
    .locator('.popup-container')
    .screenshot({ path: path.resolve('artifacts/requirements/popup-keyboard/implemented-scroll-narrow-short.png') })
  expect(await page.getByTestId('popup-quick-link').count()).toBeLessThanOrEqual(60)
})

test('popup keyboard actions preserve tab IDs and open full URLs in new tabs', async ({ page, extensionId }) => {
  await prepare(page, extensionId)
  const search = page.getByRole('combobox')
  await search.fill('open/24')
  await search.press('ArrowDown')
  await expect(search).toBeFocused()
  await expect(page.getByTestId('popup-page-row')).toHaveAttribute('aria-selected', 'true')
  await search.press('Enter')
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
  await page.getByRole('combobox').fill('issues?q=actual')
  await expect(page.getByTestId('popup-page-row')).toHaveCount(1)
  await page.getByTestId('popup-page-row').click()
  expect(
    await page.evaluate(async () => (await chrome.tabs.query({})).find(tab => tab.url?.includes('/issues?'))?.active),
  ).toBe(true)
  await page.getByRole('combobox').fill('Saved real page')
  const created = context.waitForEvent('page')
  await page.getByRole('combobox').press('Enter')
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
  await page.getByRole('combobox').fill('history/')
  await expect(page.getByTestId('popup-page-row')).toHaveCount(0)
  await page.getByRole('combobox').fill('open/0')
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
  await page.getByRole('combobox').fill('q=34')
  await page.getByRole('combobox').press('Enter')
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await page.evaluate(() => window.popupTest.closed)).toBe(false)
  await page.evaluate(() =>
    Object.defineProperty(chrome.tabs, 'create', {
      value: async (properties: chrome.tabs.CreateProperties) => {
        window.popupTest.opened.push(properties)
      },
    }),
  )
  await page.getByRole('combobox').press('Enter')
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
  await page.getByRole('combobox').fill('history/')
  await expect(page.getByTestId('popup-page-row')).toHaveCount(0)
})

test('late history results preserve wheel position and the active tab identity', async ({ page, extensionId }) => {
  await prepare(page, extensionId, { failHistory: true })
  await page.setViewportSize({ width: 480, height: 360 })
  await page.getByRole('region', { name: '当前站点', exact: true }).getByRole('button', { name: '查看全部' }).click()
  const search = page.getByRole('combobox'),
    content = page.locator('.popup-content')
  await search.press('ArrowDown')
  await expect(page.locator('[aria-selected="true"]')).toHaveAttribute('data-popup-result', 'tab:10002')
  await page.evaluate(() =>
    Object.defineProperty(chrome.history, 'search', {
      value: () =>
        new Promise<chrome.history.HistoryItem[]>(resolve => {
          window.popupTest.historyResolve = resolve
        }),
    }),
  )
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Boolean(window.popupTest.historyResolve))).toBe(true)
  await search.focus()
  await content.evaluate(element => {
    element.scrollTop = 400
  })
  await expect.poll(() => content.evaluate(element => element.scrollTop)).toBe(400)
  await page.evaluate(history => window.popupTest.historyResolve?.(history), history)
  await expect(content).toHaveAttribute('data-total', '50')
  expect(await content.evaluate(element => element.scrollTop)).toBe(400)
  await expect(page.locator('[aria-selected="true"]')).toHaveAttribute('data-popup-result', 'tab:10002')
  await expect(search).toBeFocused()
  await search.press('ArrowDown')
  await expect(page.locator('[aria-selected="true"]')).toBeInViewport()
})

test('popup keeps typing focus while navigating grids, searching and previewing modifiers', async ({
  page,
  extensionId,
}) => {
  await prepare(page, extensionId)
  const search = page.getByRole('combobox')
  const selected = page.locator('[data-popup-result][aria-selected="true"]')
  await expect(search).toBeFocused()
  await expect(selected).toHaveCount(0)
  await search.press('Enter')
  expect(await page.evaluate(() => window.popupTest.closed)).toBe(false)
  expect(await page.evaluate(() => window.popupTest.opened)).toEqual([])
  await search.press('ArrowDown')
  await expect(selected).toContainText('Saved 0')
  await search.press('ArrowRight')
  await expect(selected).toContainText('Saved 1')
  await search.press('ArrowDown')
  await expect(selected).toContainText('Saved 5')
  await search.press('ArrowDown')
  await expect(selected).toContainText('Opened page 0')
  await search.press('ArrowUp')
  await expect(selected).toContainText('Saved 7')
  await expect(search).toBeFocused()
  await search.pressSequentially('Saved 3')
  await expect(search).toHaveValue('Saved 3')
  await expect(selected).toContainText('Saved 3')
  await search.press('ArrowDown')
  await expect(selected).toContainText('Saved 30')
  await search.press('Home')
  await search.press('Delete')
  await expect(search).toHaveValue('aved 3')
  await expect(search).toBeFocused()
  await page.keyboard.down('Shift')
  await expect(page.locator('#popup-current-action')).toContainText('新开窗口')
  await page.keyboard.down('Control')
  await expect(page.locator('#popup-current-action')).toContainText('在当前标签旁打开')
  await page.keyboard.up('Shift')
  await expect(page.locator('#popup-current-action')).toContainText('新开标签')
  await page.keyboard.up('Control')
  await expect(page.locator('#popup-current-action')).toContainText('打开')
  await page.setViewportSize({ width: 480, height: 700 })
  await page
    .locator('.popup-container')
    .screenshot({ path: path.resolve('artifacts/requirements/popup-keyboard/implemented-keyboard-search.png') })
  await search.fill('no such recorded page')
  await expect(selected).toHaveCount(0)
  await expect(search).not.toHaveAttribute('aria-activedescendant')
  await expect(page.locator('.popup-search-scope')).toContainText('popup.example')
  await search.press('Enter')
  expect(await page.evaluate(() => window.popupTest.closed)).toBe(false)
  await search.press('Escape')
  await page.setViewportSize({ width: 320, height: 360 })
  await expect(page.getByTestId('popup-quick-link')).toHaveCount(6)
  await search.press('Home')
  await search.press('ArrowDown')
  await expect(selected).toContainText('Saved 3')
  await search.press('ArrowDown')
  await expect(selected).toContainText('Opened page 0')
})

test('popup Tab skips results and the native help dialog returns to the same search', async ({ page, extensionId }) => {
  await page.setViewportSize({ width: 480, height: 700 })
  await prepare(page, extensionId)
  const search = page.getByRole('combobox')
  await search.fill('history/24')
  await search.press('Tab')
  await expect(page.getByRole('button', { name: '清空搜索' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('add-current-page')).toBeFocused()
  await page.keyboard.press('Tab')
  const help = page.getByRole('button', { name: '快捷键说明', exact: true })
  await expect(help).toBeFocused()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: '快捷键说明' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Alt+Shift+K')
  const close = dialog.getByRole('button', { name: '关闭', exact: true })
  await expect(close).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.locator('.popup-help-body')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await dialog.screenshot({ path: path.resolve('artifacts/requirements/popup-keyboard/implemented-keyboard-help.png') })
  await page.setViewportSize({ width: 320, height: 360 })
  await expect(close).toBeInViewport()
  await dialog.locator('.popup-help-body').evaluate(element => {
    element.scrollTop = element.scrollHeight
  })
  await expect(dialog.locator('.popup-help-body > div').last()).toBeInViewport()
  await dialog.screenshot({
    path: path.resolve('artifacts/requirements/popup-keyboard/implemented-keyboard-help-short.png'),
  })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(search).toBeFocused()
  await expect(search).toHaveValue('history/24')
  await expect(page.locator('[aria-selected="true"]')).toContainText('Recent page 24')
  expect(await page.evaluate(() => window.popupTest.closed)).toBe(false)
})

test('popup leaves IME confirmation and navigation to the composition session', async ({ page, extensionId }) => {
  await prepare(page, extensionId)
  const search = page.getByRole('combobox')
  await search.fill('open/0')
  await search.dispatchEvent('compositionstart', { data: '测试' })
  await search.press('Alt+1')
  await expect(page.locator('.popup-container')).toHaveAttribute('data-view', 'home')
  await search.press('Enter')
  await search.press('ArrowDown')
  await search.press('Escape')
  await expect(search).toHaveValue('open/0')
  expect(await page.evaluate(() => window.popupTest.switched)).toEqual([])
  await search.dispatchEvent('compositionend', { data: '测试' })
  await search.evaluate(element =>
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true })),
  )
  expect(await page.evaluate(() => window.popupTest.switched)).toEqual([])
  await search.press('Enter')
  expect(await page.evaluate(() => window.popupTest.switched)).toEqual([10002])
})

test('popup preserves selection by identity when saved data changes', async ({ page, extensionId }) => {
  await prepare(page, extensionId)
  const search = page.getByRole('combobox')
  const selected = page.locator('[data-popup-result][aria-selected="true"]')
  await search.fill('Saved')
  await search.press('ArrowDown')
  await expect(selected).toHaveAttribute('data-popup-result', 'saved:1')
  await page.evaluate(async key => {
    const items = (await chrome.storage.local.get(key))[key]
    await chrome.storage.local.set({
      [key]: [{ id: 'prepend', title: 'Saved newest', url: 'https://saved.example/new' }, ...items],
    })
  }, savedKey)
  await expect(selected).toHaveAttribute('data-popup-result', 'saved:1')
  await page.evaluate(async key => {
    const items = (await chrome.storage.local.get(key))[key]
    await chrome.storage.local.set({ [key]: items.filter((item: { id: string }) => item.id !== '1') })
  }, savedKey)
  await expect(selected).toHaveAttribute('data-popup-result', 'saved:2')
  await expect(search).toBeFocused()
  expect(await page.evaluate(() => window.popupTest.opened)).toEqual([])
})

test('popup suppresses repeated Enter while an open request is pending', async ({ page, extensionId }) => {
  await prepare(page, extensionId)
  await page.evaluate(() =>
    Object.defineProperty(chrome.tabs, 'create', {
      value: async (properties: chrome.tabs.CreateProperties) => {
        window.popupTest.opened.push(properties)
        await new Promise<void>(resolve => {
          window.popupTest.createResolve = resolve
        })
      },
    }),
  )
  const search = page.getByRole('combobox')
  await search.fill('q=34')
  await search.press('Enter')
  await search.press('Enter')
  await search.press('Alt+2')
  await expect(page.locator('.popup-container')).toHaveAttribute('data-view', 'home')
  await expect(search).toHaveValue('q=34')
  expect(await page.evaluate(() => window.popupTest.opened.length)).toBe(1)
  expect(await page.evaluate(() => window.popupTest.closed)).toBe(false)
  await page.evaluate(() => window.popupTest.createResolve?.())
  await expect.poll(() => page.evaluate(() => window.popupTest.closed)).toBe(true)
})

test('popup distinguishes an unreadable shortcut from an unassigned one and retries on reopen', async ({
  page,
  extensionId,
}) => {
  await prepare(page, extensionId)
  const help = page.getByRole('button', { name: '快捷键说明', exact: true })
  const dialog = page.getByRole('dialog', { name: '快捷键说明' })
  await page.evaluate(() =>
    Object.defineProperty(chrome.commands, 'getAll', {
      configurable: true,
      value: async () => {
        throw Error('Unavailable')
      },
    }),
  )
  await help.click()
  await expect(dialog).toContainText('无法读取快捷键')
  await expect(dialog).not.toContainText('未分配')
  await page.keyboard.press('Escape')
  await page.evaluate(() =>
    Object.defineProperty(chrome.commands, 'getAll', {
      value: async () => [{ name: '_execute_action', shortcut: '', description: '' }],
    }),
  )
  await help.click()
  await expect(dialog).toContainText('未分配')
  await page.keyboard.press('Escape')
  await page.evaluate(() =>
    Object.defineProperty(chrome.commands, 'getAll', {
      value: async () => [{ name: '_execute_action', shortcut: 'Ctrl+Shift+Y', description: '' }],
    }),
  )
  await help.click()
  await expect(dialog).toContainText('Ctrl+Shift+Y')
})

test.describe('localized popup keyboard layout', () => {
  test.use({ extensionLocale: 'de-DE' })
  test('long localized actions keep titles readable in a narrow short window', async ({ page, extensionId }) => {
    await prepare(page, extensionId)
    await page.setViewportSize({ width: 320, height: 360 })
    const search = page.getByRole('combobox')
    await search.fill('history/0')
    await page.keyboard.down('Control')
    await page.keyboard.down('Shift')
    const selected = page.locator('[data-popup-result][aria-selected="true"]')
    await expect(page.locator('#popup-current-action')).toContainText('Neben aktuellem Tab öffnen')
    expect(
      await selected.locator('.popup-row-title').evaluate(element => element.getBoundingClientRect().width),
    ).toBeGreaterThan(160)
    await expect(search).toBeInViewport()
    await expect(page.locator('.popup-action-preview')).toBeInViewport()
    expect(await page.locator('.popup-container').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    )
    await page.evaluate(() => chrome.storage.local.set({ 'theme-storage-key': 'dark' }))
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.locator('.popup-container').screenshot({
      path: path.resolve('artifacts/requirements/popup-keyboard/implemented-keyboard-german-dark-short.png'),
    })
    await page.keyboard.up('Shift')
    await page.keyboard.up('Control')
  })
})
