import type { BrowserContext, Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { test, expect } from './fixtures'
import type { ActivitySnapshot } from '../utils/page-activity/model'
import type { ActivityScoreDiagnostic } from '../utils/page-activity/scoring'

const fixturePages = [
  { url: 'https://github.return.test/NextTab/issues/181', title: 'NextTab · 首页信息层级讨论' },
  { url: 'https://github.return.test/NextTab/readme?id=1#intro', title: 'NextTab · 使用说明与快捷键' },
  { url: 'https://notion.return.test/roadmap', title: 'NextTab 产品路线与需求优先级' },
  { url: 'https://figma.return.test/design', title: '新标签页 · 桌面与窄窗口设计' },
  { url: 'https://github.return.test/NextTab/pull/182', title: 'NextTab · 搜索体验改进 #182' },
  { url: 'https://github.return.test/NextTab/pull/183', title: 'NextTab · 回到页面与常用网站布局 #183' },
]

async function prepare(page: Page, context: BrowserContext, extensionId: string, count = 6, liveActivity = false) {
  if (!liveActivity) {
    // Layout/history tests use history order; live tracking is exercised separately below.
    await page.addInitScript(() => {
      const sendMessage = chrome.runtime.sendMessage.bind(chrome.runtime)
      Object.defineProperty(chrome.runtime, 'sendMessage', {
        value: (message: { type: string }) =>
          message.type === 'nexttab:page-activity-snapshot'
            ? Promise.resolve({ pages: [], events: [], activeViewId: null, now: Date.now(), bytes: 0 })
            : sendMessage(message),
      })
    })
  }
  await context.route(/^https:\/\/[^/]+\.return\.test\//, route => {
    const title =
      fixturePages.find(item => item.url.split('#')[0] === route.request().url())?.title ?? 'NextTab 示例页面'
    return route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<meta charset="utf-8"><title>${title}</title><p>${title}</p>`,
    })
  })
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(() =>
    chrome.storage.local.set({
      'onboarding-completed-key': true,
      'theme-storage-key': 'light',
      'quick-url-item-storage-key': [
        { id: 'github', title: 'GitHub', url: 'https://github.return.test/' },
        { id: 'notion', title: 'Notion', url: 'https://notion.return.test/' },
        { id: 'figma', title: 'Figma', url: 'https://figma.return.test/' },
        { id: 'linear', title: 'Linear', url: 'https://linear.return.test/' },
        { id: 'gmail', title: 'Gmail', url: 'https://gmail.return.test/' },
        { id: 'calendar', title: '日历', url: 'https://calendar.return.test/' },
      ],
    }),
  )
  const historyPage = await context.newPage()
  for (const item of fixturePages.slice(0, count)) {
    await historyPage.goto(item.url)
    await expect(historyPage).toHaveTitle(item.title)
  }
  if (!count) await historyPage.close()
  await page.bringToFront()
  await page.reload()
  await expect(page.locator('.nt-return-pages')).toHaveAttribute('aria-busy', 'false')
  return historyPage
}

const visibleRows = (page: Page) => page.locator('[data-home-return-row][data-visible="true"]')

const activitySnapshot = (page: Page) =>
  page.evaluate<ActivitySnapshot>(() => chrome.runtime.sendMessage({ type: 'nexttab:page-activity-snapshot' }))

async function delayReturnLoads(page: Page, frequent: 'all' | 'few' | 'empty' = 'all') {
  await page.evaluate(mode => {
    const search = chrome.history.search.bind(chrome.history)
    let requests = 0
    document.documentElement.dataset.frequentFixture = mode
    Object.defineProperty(chrome.history, 'search', {
      value: async (query: chrome.history.HistoryQuery) => {
        if (query.maxResults !== 1000) return search(query)
        const id = ++requests
        const release = new Promise<void>((resolve, reject) => {
          const listener = (event: Event) => {
            const result = (event as CustomEvent<{ id: number; error?: boolean }>).detail
            if (result.id !== id) return
            document.removeEventListener('return-load-result', listener)
            if (result.error) reject(new Error('History unavailable'))
            else resolve()
          }
          document.addEventListener('return-load-result', listener)
        })
        document.documentElement.dataset.returnLoadRequests = String(requests)
        const [history] = await Promise.all([search(query), release])
        if (query.startTime! < Date.now() - 10 * 86400000) {
          const mode = document.documentElement.dataset.frequentFixture
          if (mode === 'empty') return []
          if (mode === 'few') return history.filter(item => /roadmap|pull\/183/.test(item.url ?? ''))
        }
        return history
      },
    })
    Object.defineProperty(chrome.history, 'getVisits', {
      value: async ({ url }: { url: string }) => {
        const mode = document.documentElement.dataset.frequentFixture
        const days = mode === 'all' || (mode === 'few' && /roadmap|pull\/183/.test(url)) ? [0, 1] : [0]
        return days.map((day, i) => ({
          id: String(i),
          visitId: String(i),
          visitTime: Date.now() - day * 86400000 - 60000,
          referringVisitId: '0',
          transition: 'link',
        }))
      },
    })
  }, frequent)
}

async function releaseReturnLoad(page: Page, id: number, error = false) {
  await page.evaluate(detail => document.dispatchEvent(new CustomEvent('return-load-result', { detail })), {
    id,
    error,
  })
}

async function returnLayout(page: Page) {
  return page.evaluate(() => ({
    panel: document.querySelector('.nt-return-pages')!.getBoundingClientRect().height,
    section: document.querySelector('.nt-return-section')!.getBoundingClientRect().height,
    sites: document.querySelector('.nt-links-section')!.getBoundingClientRect().top,
  }))
}

test('development event export downloads raw page mappings and paired events, and recovers from a failed snapshot', async ({
  page,
  context,
  extensionId,
}) => {
  await prepare(page, context, extensionId, 1, true)
  const before = await activitySnapshot(page)
  expect(before.events.length).toBeGreaterThanOrEqual(2)
  let downloads = 0
  page.on('download', () => downloads++)
  const button = page.getByTestId('return-export-events')
  await button.focus()
  const downloaded = page.waitForEvent('download')
  await button.press('Enter')
  const download = await downloaded
  expect(download.suggestedFilename()).toMatch(/^nexttab-events-.*\.json$/)
  const file = await download.path()
  expect(file).toBeTruthy()
  const data = JSON.parse(await readFile(file!, 'utf8'))
  expect(data).toMatchObject({
    format: 'nexttab-page-activity',
    version: 1,
    activityWindowMs: 7 * 86400000,
    retentionMs: 10 * 86400000,
    byteBudget: 2 * 1024 * 1024,
    scoringParameters: {
      recencyHalfLifeHours: 72,
      viewReference: 4,
      medianReferenceSeconds: 600,
      openTabMultiplier: 1.3,
    },
  })
  expect(Number.isFinite(Date.parse(data.exportedAt))).toBe(true)
  expect(data.snapshot.pages).toEqual(before.pages)
  expect(data.snapshot.events).toEqual(before.events)
  expect(data.snapshot.activeViewId).toBeNull()
  expect(data.openTabs).toEqual(expect.arrayContaining([expect.objectContaining({ url: fixturePages[0].url })]))
  expect((await activitySnapshot(page)).events).toEqual(before.events)
  await expect(button).toBeEnabled()

  // A failed snapshot must not produce a misleading empty export; the button stays retryable.
  await page.evaluate(() => {
    Object.defineProperty(chrome.runtime, 'sendMessage', { value: async () => ({ error: true }) })
  })
  await button.click()
  await expect(page.getByText("Couldn't export event logs. Please try again.", { exact: true })).toBeVisible()
  await expect(button).toBeEnabled()
  expect(downloads).toBe(1)
  await page.screenshot({ path: test.info().outputPath('event-export-button.png'), fullPage: true })
})

test('open tabs multiply usage by 1.3 once and only re-rank on homepage entry', async ({
  page,
  context,
  extensionId,
}) => {
  const reports: {
    stage: string
    candidates?: { pageKey: string; usageScore: number; openTabMultiplier: number; score: number }[]
  }[] = []
  page.on('console', message => {
    const prefix = '[NextTab:return-pages]'
    if (message.text().startsWith(prefix)) reports.push(JSON.parse(message.text().slice(prefix.length).trim()))
  })
  const visitor = await prepare(page, context, extensionId, 2, true)
  const duplicate = await context.newPage()
  await duplicate.goto('https://github.return.test/NextTab/readme?ref=duplicate#section')
  await page.addInitScript(
    items => {
      const sendMessage = chrome.runtime.sendMessage.bind(chrome.runtime)
      Object.defineProperty(chrome.runtime, 'sendMessage', {
        value: (message: { type: string }) => {
          if (message.type !== 'nexttab:page-activity-snapshot') return sendMessage(message)
          // Compare tab multipliers within one local day, independent of midnight/day splitting.
          const now = new Date().setHours(12, 0, 0, 0)
          return Promise.resolve({
            now,
            bytes: 0,
            activeViewId: null,
            pages: items.map((item, index) => ({
              id: index + 1,
              url: item.url,
              key: item.url.split('?')[0],
              title: item.title,
            })),
            events: items.flatMap((_item, index) => {
              const seconds = index === 0 ? 600 : 240
              const enter = {
                id: index * 2 + 1,
                viewId: String(index),
                pageId: index + 1,
                type: 'enter',
                source: 'tab',
                at: now - (index === 0 ? 1_800_000 : 600_000),
              }
              return [enter, { ...enter, id: enter.id + 1, type: 'leave', at: enter.at + seconds * 1000 }]
            }),
          })
        },
      })
    },
    fixturePages.slice(0, 2),
  )
  await page.bringToFront()
  await page.reload()
  const panel = page.locator('.nt-return-pages')
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  const latest = () => reports.findLast(report => report.stage === 'ranking')!.candidates!
  const closedKey = fixturePages[0].url
  const openedKey = fixturePages[1].url.split('?')[0]
  const openedRow = page.getByTestId('return-page-row').filter({ hasText: fixturePages[1].title }).first()
  await expect(visibleRows(page).first()).toContainText(fixturePages[1].title)
  expect(latest()[0]).toMatchObject({ pageKey: openedKey, openTabMultiplier: 1.3 })
  expect(latest()[0].score).toBeCloseTo(latest()[0].usageScore * 1.3, 10)
  expect(latest()[0].usageScore).toBeLessThan(latest().find(candidate => candidate.pageKey === closedKey)!.usageScore)
  expect(latest().filter(candidate => candidate.pageKey === openedKey)).toHaveLength(1)

  await duplicate.close()
  await visitor.close()
  await expect(openedRow.locator('.nt-return-open')).toHaveAttribute(
    'aria-label',
    `${fixturePages[1].title} — Open page`,
  )
  await expect(visibleRows(page).first()).toContainText(fixturePages[1].title)
  const home = await page.evaluate(() => chrome.tabs.getCurrent())
  const outside = await page.evaluate(() => chrome.tabs.create({ url: 'about:blank', active: true }))
  await expect
    .poll(() => page.evaluate(() => chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => tabs[0]?.id)))
    .toBe(outside.id)
  await page.evaluate(id => chrome.tabs.update(id!, { active: true }), home!.id)
  await expect.poll(() => latest()[0].pageKey).toBe(closedKey)
  expect(latest().find(candidate => candidate.pageKey === openedKey)!.openTabMultiplier).toBe(1)
  await expect(visibleRows(page).first()).toContainText(fixturePages[0].title)

  const created = await page.evaluate(url => chrome.tabs.create({ url, active: false }), fixturePages[1].url)
  await expect(openedRow.locator('.nt-return-open')).toHaveAttribute(
    'aria-label',
    `${fixturePages[1].title} — Switch to tab`,
  )
  await expect(visibleRows(page).first()).toContainText(fixturePages[0].title)
  await page.evaluate(id => chrome.tabs.update(id!, { active: true }), outside.id)
  await expect
    .poll(() => page.evaluate(() => chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => tabs[0]?.id)))
    .toBe(outside.id)
  await page.evaluate(id => chrome.tabs.update(id!, { active: true }), home!.id)
  await expect.poll(() => latest()[0].pageKey).toBe(openedKey)
  expect(latest()[0].openTabMultiplier).toBe(1.3)
  await expect(visibleRows(page).first()).toContainText(fixturePages[1].title)
  await page.evaluate(ids => chrome.tabs.remove(ids), [created.id!, outside.id!])
})

test('loading skeletons preserve the layout and rapid source switches ignore stale results', async ({
  page,
  context,
  extensionId,
}) => {
  await prepare(page, context, extensionId)
  await delayReturnLoads(page)
  const before = await returnLayout(page)
  const panel = page.locator('.nt-return-pages')
  const frequent = page.getByRole('tab', { name: 'Frequently visited', exact: true })
  const recent = page.getByRole('tab', { name: 'Recent revisits', exact: true })
  await frequent.click()
  await expect(panel).toHaveAttribute('aria-busy', 'true')
  await expect(panel.getByRole('button')).toHaveCount(0)
  await expect(page.locator('.nt-return-empty')).toHaveCount(0)
  await expect(page.locator('.nt-return-skeleton-row[data-visible="true"]')).toHaveCount(4)
  expect(await returnLayout(page)).toEqual(before)
  await page.screenshot({ path: test.info().outputPath('return-loading-skeleton.png'), fullPage: true })
  await recent.click()
  await frequent.click()
  await expect(page.locator('html')).toHaveAttribute('data-return-load-requests', '3')
  expect(await returnLayout(page)).toEqual(before)
  await releaseReturnLoad(page, 3)
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await expect(visibleRows(page)).toHaveCount(4)
  await expect(visibleRows(page).first()).toContainText('2 days')
  expect(await returnLayout(page)).toEqual(before)
  await releaseReturnLoad(page, 1)
  await releaseReturnLoad(page, 2)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(frequent).toHaveAttribute('aria-selected', 'true')
  await expect(visibleRows(page).first()).toContainText('2 days')
  await expect(panel).toHaveAttribute('aria-busy', 'false')
})

test('loading preserves short and empty layouts, then settles into results or an error', async ({
  page,
  context,
  extensionId,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await prepare(page, context, extensionId)
  await delayReturnLoads(page, 'few')
  const panel = page.locator('.nt-return-pages')
  const frequent = page.getByRole('tab', { name: 'Frequently visited', exact: true })
  const recent = page.getByRole('tab', { name: 'Recent revisits', exact: true })
  let before = await returnLayout(page)
  await frequent.click()
  await expect(panel).toHaveAttribute('aria-busy', 'true')
  expect(await returnLayout(page)).toEqual(before)
  await expect(panel.locator('.nt-return-skeleton').first()).toHaveCSS('animation-name', 'none')
  await releaseReturnLoad(page, 1)
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await expect(visibleRows(page)).toHaveCount(2)
  before = await returnLayout(page)
  await recent.click()
  await expect(panel).toHaveAttribute('aria-busy', 'true')
  await expect(panel.locator('.nt-return-skeleton-row')).toHaveCount(2)
  expect(await returnLayout(page)).toEqual(before)
  await releaseReturnLoad(page, 2)
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await page.evaluate(() => {
    document.documentElement.dataset.frequentFixture = 'empty'
  })
  before = await returnLayout(page)
  await frequent.click()
  await expect(panel).toHaveAttribute('aria-busy', 'true')
  expect(await returnLayout(page)).toEqual(before)
  await releaseReturnLoad(page, 3)
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.nt-return-empty')).toContainText('multiple days')
  await expect(page.getByTestId('return-view-all')).toHaveCount(0)
  before = await returnLayout(page)
  await recent.click()
  await expect(panel).toHaveAttribute('aria-busy', 'true')
  expect(await returnLayout(page)).toEqual(before)
  await releaseReturnLoad(page, 4, true)
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.nt-return-empty')).toContainText('page records')
  await expect(page.locator('.nt-return-skeleton')).toHaveCount(0)
})

test('returning to an existing homepage refreshes recommendations once, preserves rows and rejects stale results', async ({
  page,
  context,
  extensionId,
}) => {
  const visitor = await prepare(page, context, extensionId)
  await delayReturnLoads(page)
  const panel = page.locator('.nt-return-pages')
  const requests = page.locator('html')
  const before = await returnLayout(page)
  const returnFrom = async (url?: string) => {
    await visitor.bringToFront()
    await expect.poll(() => visitor.evaluate(() => document.visibilityState)).toBe('visible')
    if (url) await visitor.goto(url)
    await page.bringToFront()
  }
  const firstTitle = fixturePages[5].title
  await expect(visibleRows(page).first()).toContainText(firstTitle)
  await returnFrom(fixturePages[0].url)
  await expect(requests).toHaveAttribute('data-return-load-requests', '1')
  await expect(panel).toHaveAttribute('aria-busy', 'true')
  await expect(visibleRows(page).first()).toContainText(firstTitle)
  await expect(page.locator('.nt-return-skeleton-row')).toHaveCount(0)
  expect(await returnLayout(page)).toEqual(before)
  // The accompanying focus event must not launch a second query or reorder while pending.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await releaseReturnLoad(page, 1)
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await expect(visibleRows(page).first()).toContainText(fixturePages[0].title)
  await expect(requests).toHaveAttribute('data-return-load-requests', '1')

  // A navigation in a background tab does not move the list under the user's pointer.
  await visitor.goto(fixturePages[2].url)
  await expect(visitor).toHaveTitle(fixturePages[2].title)
  await expect(visibleRows(page).first()).toContainText(fixturePages[0].title)
  await expect(requests).toHaveAttribute('data-return-load-requests', '1')
  await returnFrom()
  await expect(requests).toHaveAttribute('data-return-load-requests', '2')
  await returnFrom(fixturePages[3].url)
  await expect(requests).toHaveAttribute('data-return-load-requests', '3')
  await releaseReturnLoad(page, 3)
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await expect(visibleRows(page).first()).toContainText(fixturePages[3].title)
  await releaseReturnLoad(page, 2)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(visibleRows(page).first()).toContainText(fixturePages[3].title)

  await returnFrom()
  await expect(requests).toHaveAttribute('data-return-load-requests', '4')
  await releaseReturnLoad(page, 4, true)
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await expect(visibleRows(page).first()).toContainText(fixturePages[3].title)
  await expect(page.locator('.nt-return-refresh-error')).toContainText('Previous results are still shown')
  // Exercise the persisted pageshow path used by the browser's back/forward cache.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
  await expect(requests).toHaveAttribute('data-return-load-requests', '5')
  await releaseReturnLoad(page, 5)
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.nt-return-refresh-error')).toHaveCount(0)

  await returnFrom()
  await expect(requests).toHaveAttribute('data-return-load-requests', '6')
  await page.evaluate(() => chrome.history.deleteAll())
  await expect(visibleRows(page)).toHaveCount(0)
  await releaseReturnLoad(page, 6)
  await expect(visibleRows(page)).toHaveCount(0)
  await expect(panel).toHaveAttribute('aria-busy', 'false')
})

test('window reentry refreshes the selected source and browser Back restores it', async ({
  page,
  context,
  extensionId,
  headless,
}) => {
  await prepare(page, context, extensionId)
  await delayReturnLoads(page)
  const frequent = page.getByRole('tab', { name: 'Frequently visited', exact: true })
  const panel = page.locator('.nt-return-pages')
  await frequent.click()
  await expect(page.locator('html')).toHaveAttribute('data-return-load-requests', '1')
  await releaseReturnLoad(page, 1)
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  const before = await returnLayout(page)
  await page.evaluate(() => {
    document.documentElement.dataset.frequentFixture = 'few'
  })
  let otherWindow: number | undefined
  if (headless) {
    // Headless Chromium does not model native window focus; exercise the DOM fallback.
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'))
      window.dispatchEvent(new Event('focus'))
    })
  } else {
    // --headed verifies the same outcome with real browser windows and native focus events.
    const windows = await page.evaluate(async () => {
      const current = await chrome.windows.getCurrent()
      const other = await chrome.windows.create({ url: 'about:blank', focused: true, width: 320, height: 400 })
      return { current: current.id!, other: other.id! }
    })
    otherWindow = windows.other
    await expect
      .poll(() => page.evaluate(id => chrome.windows.get(id).then(window => window.focused), windows.current))
      .toBe(false)
    await page.evaluate(id => chrome.windows.update(id, { focused: true }), windows.current)
  }
  await expect(page.locator('html')).toHaveAttribute('data-return-load-requests', '2')
  await expect(frequent).toHaveAttribute('aria-selected', 'true')
  await expect(panel).toHaveAttribute('aria-busy', 'true')
  expect(await returnLayout(page)).toEqual(before)
  await releaseReturnLoad(page, 2)
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await expect(visibleRows(page)).toHaveCount(2)
  if (otherWindow !== undefined) await page.evaluate(id => chrome.windows.remove(id), otherWindow)
  await expect(page.locator('html')).toHaveAttribute('data-return-load-requests', '2')

  await page.goto(fixturePages[0].url)
  await expect(page).toHaveTitle(fixturePages[0].title)
  await page.goBack()
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await expect(frequent).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('return-page-row').filter({ hasText: fixturePages[0].title }).first()).toBeVisible()
})

test('return source selection survives reloads and new tabs, and visits follow the latest logged enter', async ({
  page,
  context,
  extensionId,
}) => {
  const visitor = await prepare(page, context, extensionId, 6, true)
  await visitor.close()
  const sources = [
    ['Frequently visited', 'frequent'],
    ['Recently visited', 'history'],
    ['Recent revisits', 'recent'],
  ] as const
  for (const [label, source] of sources) {
    await page.getByRole('tab', { name: label, exact: true }).click()
    await expect(page.locator('.nt-return-pages')).toHaveAttribute('aria-busy', 'false')
    await expect
      .poll(() =>
        page.evaluate(async () => (await chrome.storage.local.get('return-page-source'))['return-page-source']),
      )
      .toBe(source)
    await page.reload()
    await expect(page.getByRole('tab', { name: label, exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.nt-return-pages')).toHaveAttribute('aria-busy', 'false')
    const nextTab = await context.newPage()
    await nextTab.goto(`chrome-extension://${extensionId}/newtab.html`)
    await expect(nextTab.getByRole('tab', { name: label, exact: true })).toHaveAttribute('aria-selected', 'true')
    await nextTab.close()
  }

  const recent = page.getByRole('tab', { name: 'Recent revisits', exact: true })
  await recent.focus()
  await recent.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  const history = page.getByRole('tab', { name: 'Recently visited', exact: true })
  await expect(history).toBeFocused()
  await history.press('Enter')
  await expect(history).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.nt-return-pages')).toHaveAttribute('aria-busy', 'false')
  const snapshot = await activitySnapshot(page)
  const latestEnters = new Map<number, number>()
  for (const event of snapshot.events) {
    if (event.type === 'enter') latestEnters.set(event.pageId, Math.max(event.at, latestEnters.get(event.pageId) ?? 0))
  }
  const expectedTitles = snapshot.pages
    .filter(item => latestEnters.has(item.id))
    .sort((a, b) => latestEnters.get(b.id)! - latestEnters.get(a.id)!)
    .map(item => item.title.trim() || item.url)
  expect(expectedTitles).toHaveLength(6)
  await expect(visibleRows(page).first()).toContainText(expectedTitles[0])
  await page.getByTestId('return-view-all').click()
  const dialog = page.getByRole('dialog', { name: 'Recently visited', exact: true })
  await expect(dialog.locator('.nt-return-title')).toHaveText(expectedTitles)
  await dialog.getByRole('textbox').fill('NextTab')
  await expect(dialog.locator('.nt-return-title')).toHaveText(expectedTitles.filter(title => title.includes('NextTab')))
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('return-view-all')).toBeFocused()
  await page.evaluate(url => chrome.history.deleteUrl({ url }), fixturePages[5].url)
  await expect(page.locator(`.nt-return-pages [data-page-url="${fixturePages[5].url}"]`)).toHaveCount(0)
  await expect(page.locator(`.nt-return-pages [data-page-url="${fixturePages[4].url}"]`)).toBeVisible()
})

test('recent visits use background event logs, refresh on reentry and ignore recommendation filters', async ({
  page,
  context,
  extensionId,
}) => {
  const visitor = await prepare(page, context, extensionId, 1, true)
  await page.evaluate(
    url =>
      chrome.storage.local.set({
        'return-page-preferences': { hiddenUrls: [url], excludedHosts: ['github.return.test'] },
      }),
    fixturePages[0].url,
  )
  await page.getByRole('tab', { name: 'Recently visited', exact: true }).click()
  const panel = page.locator('.nt-return-pages')
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  const originalRow = panel.locator(`[data-page-url="${fixturePages[0].url}"]`)
  await expect(originalRow).toBeVisible()
  await originalRow.locator('.nt-return-more').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Hide this page', exact: true })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: "Don't suggest this website", exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')

  const historyOnly = 'https://github.return.test/NextTab/browser-history-only'
  await page.evaluate(url => chrome.history.addUrl({ url }), historyOnly)
  const first = 'https://github.return.test/NextTab/recent-one?id=1'
  const second = 'https://github.return.test/NextTab/recent-two?id=2'
  await visitor.bringToFront()
  await visitor.goto(first)
  await expect(visitor).toHaveTitle('NextTab 示例页面')
  await page.bringToFront()
  await expect(visibleRows(page).first().getByTestId('return-page-row')).toHaveAttribute('data-page-url', first)
  await visitor.bringToFront()
  await visitor.goto(second)
  await expect(visitor).toHaveTitle('NextTab 示例页面')
  await page.bringToFront()
  await expect(visibleRows(page).first().getByTestId('return-page-row')).toHaveAttribute('data-page-url', second)
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await expect(panel.getByTestId('return-page-row')).toHaveCount(3)

  await page.getByTestId('return-view-all').click()
  const dialog = page.getByRole('dialog', { name: 'Recently visited', exact: true })
  await expect(dialog.getByTestId('return-page-row')).toHaveCount(3)
  await expect(dialog.locator(`[data-page-url="${historyOnly}"]`)).toHaveCount(0)
  await dialog.getByRole('textbox').fill('?id=1')
  await expect(dialog.getByTestId('return-page-row')).toHaveCount(1)
  await expect(dialog.getByTestId('return-page-row')).toHaveAttribute('data-page-url', first)
  await dialog.getByRole('button', { name: 'Page selection rules', exact: true }).hover()
  await expect(page.locator('.nt-return-rules')).toContainText('newest first')
  await expect(page.locator('.nt-return-rules')).not.toContainText('Hidden pages')
  await page.mouse.move(0, 0)
  await page.keyboard.press('Escape')

  await visitor.close()
  await page.bringToFront()
  await expect(panel.locator(`[data-page-url="${first}"] .nt-return-open`)).toHaveAccessibleName(/Open page$/)
  await expect(panel.locator(`[data-page-url="${second}"] .nt-return-open`)).toHaveAccessibleName(/Open page$/)
  await page.evaluate(url => chrome.history.deleteUrl({ url }), first)
  await expect(panel.locator(`[data-page-url="${first}"]`)).toHaveCount(0)
  await expect(panel.locator(`[data-page-url="${second}"]`)).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('event-log-unfiltered-live.png'), fullPage: true })

  // Collection continues in background while every new-tab page is closed.
  const withoutNewTab = await context.newPage()
  await withoutNewTab.goto('https://github.return.test/NextTab/while-open')
  await page.close()
  const latest = 'https://github.return.test/NextTab/without-newtab'
  await withoutNewTab.goto(latest)
  await expect(withoutNewTab).toHaveTitle('NextTab 示例页面')
  const reopened = await context.newPage()
  await reopened.goto(`chrome-extension://${extensionId}/newtab.html`)
  await expect(reopened.getByRole('tab', { name: 'Recently visited', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(visibleRows(reopened).first().getByTestId('return-page-row')).toHaveAttribute('data-page-url', latest)
  await expect(reopened.locator('.nt-return-pages')).toHaveAttribute('aria-busy', 'false')
  expect((await activitySnapshot(reopened)).pages.some(item => item.url === latest)).toBe(true)
})

for (const locale of ['zh-CN', 'de']) {
  test.describe(`localized return tabs (${locale})`, () => {
    test.use({ extensionLocale: locale })

    test('keeps all three tabs within the section in narrow and short windows', async ({
      page,
      context,
      extensionId,
    }) => {
      await prepare(page, context, extensionId, 6, true)
      const triggers = page.locator('.nt-return-section [data-slot="tabs-trigger"]')
      await expect(triggers).toHaveCount(3)
      await triggers.first().focus()
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      await expect(triggers.last()).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(triggers.last()).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('.nt-return-pages')).toHaveAttribute('aria-busy', 'false')
      for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 390, height: 700 },
        { width: 320, height: 600 },
        { width: 900, height: 360 },
      ]) {
        await page.setViewportSize(viewport)
        const section = page.getByTestId('return-pages-section')
        await expect.poll(() => section.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
        for (const trigger of await triggers.all()) {
          await expect(trigger).toBeInViewport()
          const bounds = (await trigger.boundingBox())!
          expect(bounds.x).toBeGreaterThanOrEqual(0)
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
        }
        await section.screenshot({ path: test.info().outputPath(`return-tabs-${viewport.width}.png`) })
      }
    })
  })
}

test('return pages stay before horizontal sites and adapt to the real viewport', async ({
  page,
  context,
  extensionId,
}) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await prepare(page, context, extensionId)
  await expect(visibleRows(page)).toHaveCount(4)
  await expect(page.locator('.nt-return-action')).toHaveCount(0)
  await expect(visibleRows(page).first().locator('.nt-return-hint')).toHaveCSS('opacity', '0')
  await expect(visibleRows(page).first()).toContainText(fixturePages[5].title)
  for (const [width, height, label] of [
    [1440, 900, 'desktop'],
    [800, 800, 'tablet'],
    [390, 844, 'narrow'],
    [320, 900, 'small'],
    [900, 550, 'short'],
  ] as const) {
    await page.setViewportSize({ width, height })
    // Resizing schedules the row fitting on the next frame. Check the fitted layout too.
    await expect(async () => {
      const layout = await page.evaluate(() => {
        const section = document.querySelector<HTMLElement>('.nt-return-section')!
        const sites = document.querySelector<HTMLElement>('.nt-links-section')!
        const firstSite = document.querySelector<HTMLElement>('.nt-link')!
        const rows = document.querySelectorAll('[data-home-return-row][data-visible="true"]')
        return {
          count: rows.length,
          ordered: section.getBoundingClientRect().bottom < sites.getBoundingClientRect().top,
          overflow: document.documentElement.scrollWidth > innerWidth,
          siteBottom: firstSite.getBoundingClientRect().bottom,
        }
      })
      expect(layout.ordered).toBe(true)
      expect(layout.overflow).toBe(false)
      expect(layout.count).toBeGreaterThanOrEqual(1)
      expect(layout.count).toBeLessThanOrEqual(4)
      if (height <= 550) expect(layout.count).toBeLessThan(4)
      if (layout.count > 1) expect(layout.siteBottom).toBeLessThanOrEqual(height)
    }).toPass({ timeout: 5000 })
    await page.screenshot({ path: test.info().outputPath(`return-${label}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => chrome.storage.local.set({ 'theme-storage-key': 'dark' }))
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByTestId('quick-link-card').first()).toHaveCSS('background-color', 'rgb(22, 22, 24)')
  await page.screenshot({ path: test.info().outputPath('return-dark.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('return actions switch existing tabs and reopen a closed target without duplicates', async ({
  page,
  context,
  extensionId,
}) => {
  const target = await prepare(page, context, extensionId)
  const first = visibleRows(page).first()
  const open = first.locator('.nt-return-open')
  await expect(open).toHaveAccessibleName(`${fixturePages[5].title} — Switch to tab`)
  await open.hover()
  await expect(first.locator('.nt-return-hint')).toHaveCSS('opacity', '1')
  await expect(page.locator('[data-slot="tooltip-content"]')).toContainText('Switch to tab')
  const count = context.pages().length
  await open.click()
  await expect
    .poll(() => page.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].url))
    .toBe(fixturePages[5].url)
  expect(context.pages()).toHaveLength(count)
  await target.close()
  await page.bringToFront()
  await expect(open).toHaveAccessibleName(`${fixturePages[5].title} — Open page`)
  await open.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(open).toBeFocused()
  await expect(first.locator('.nt-return-hint')).toHaveCSS('opacity', '1')
  await expect(page.locator('[data-slot="tooltip-content"]')).toContainText('Open page')
  await open.press('Enter')
  await expect(page).toHaveURL(fixturePages[5].url)
  expect(context.pages()).toHaveLength(count - 1)
})

test('return list searches all candidates and feedback can be undone or reset', async ({
  page,
  context,
  extensionId,
}) => {
  await prepare(page, context, extensionId)
  await page.getByTestId('return-view-all').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByTestId('return-page-row')).toHaveCount(6)
  await dialog.getByRole('textbox').fill('使用说明')
  await expect(dialog.getByTestId('return-page-row')).toHaveCount(1)
  await expect(dialog.getByTestId('return-page-row')).toHaveAttribute('data-page-url', fixturePages[1].url)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('return-view-all')).toBeFocused()
  const firstTitle = fixturePages[5].title
  await visibleRows(page).first().hover()
  await visibleRows(page)
    .first()
    .getByRole('button', { name: `More actions for ${firstTitle}` })
    .click()
  await page.getByRole('menuitem', { name: 'Hide this page', exact: true }).click()
  await expect(page.locator('[data-home-return-row]').filter({ hasText: firstTitle })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(visibleRows(page).first()).toContainText(firstTitle)
  await visibleRows(page).first().hover()
  await visibleRows(page)
    .first()
    .getByRole('button', { name: `More actions for ${firstTitle}` })
    .click()
  await page.getByRole('menuitem', { name: "Don't suggest this website", exact: true }).click()
  await expect(page.locator('[data-home-return-row] [data-page-url^="https://github.return.test/"]')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('[data-home-return-row] [data-page-url^="https://github.return.test/"]')).toHaveCount(0)
  await page.getByTestId('settings-trigger').click()
  await page.getByTestId('reset-return-pages').click()
  await page.keyboard.press('Escape')
  await expect(visibleRows(page).first()).toContainText(firstTitle)
})

test('large page lists stay bounded, paginate with keyboard focus and search all records under CPU slowdown', async ({
  page,
  context,
  extensionId,
}) => {
  test.setTimeout(60000)
  await prepare(page, context, extensionId, 0)
  await page.evaluate(async () => {
    for (let index = 0; index < 65; index++)
      await chrome.history.addUrl({ url: `https://github.return.test/pager/${String(index).padStart(3, '0')}` })
  })
  await page.reload()
  await expect(page.locator('.nt-return-pages')).toHaveAttribute('aria-busy', 'false')
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  await page.getByTestId('return-view-all').click()
  const dialog = page.locator('.nt-return-all-dialog')
  const pagination = dialog.getByRole('navigation', { name: 'Page navigation' })
  await expect(dialog.getByTestId('return-page-row')).toHaveCount(20)
  await expect(pagination.getByRole('status')).toHaveText('1–20 of 65')
  await expect(pagination.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  for (const expected of ['21–40 of 65', '41–60 of 65', '61–65 of 65']) {
    await pagination.getByRole('button', { name: 'Next page' }).press('Enter')
    await expect(pagination.getByRole('status')).toHaveText(expected)
    await expect(dialog.getByTestId('return-page-row').first().locator('.nt-return-open')).toBeFocused()
  }
  await expect(dialog.getByTestId('return-page-row')).toHaveCount(5)
  await expect(pagination.getByRole('button', { name: 'Next page' })).toBeDisabled()
  await pagination.getByRole('button', { name: 'Previous page' }).click()
  await dialog.getByRole('textbox').fill('/pager/000')
  await expect(dialog.getByTestId('return-page-row')).toHaveCount(1)
  await expect(dialog.getByTestId('return-page-row')).toHaveAttribute(
    'data-page-url',
    'https://github.return.test/pager/000',
  )
  await dialog.getByRole('textbox').fill('')
  await expect(pagination.getByRole('status')).toHaveText('1–20 of 65')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('return-view-all')).toBeFocused()
  await page.getByRole('button', { name: 'Show pages from GitHub' }).click()
  const site = page.getByTestId('site-pages-dialog')
  await expect(site.getByTestId('return-page-row')).toHaveCount(20)
  await site.getByRole('button', { name: 'View recent history' }).click()
  await expect(site.getByTestId('return-page-row')).toHaveCount(20)
  await site.getByRole('textbox').fill('/pager/000')
  await expect(site.getByTestId('return-page-row')).toHaveCount(1)
})

test('single visits, empty history, history deletion and the homepage switch behave correctly', async ({
  page,
  context,
  extensionId,
}) => {
  await prepare(page, context, extensionId, 1)
  await expect(visibleRows(page)).toHaveCount(1)
  await page.evaluate(url => chrome.history.deleteUrl({ url }), fixturePages[0].url)
  await expect(visibleRows(page)).toHaveCount(0)
  await expect(page.getByTestId('return-view-all')).toHaveCount(0)
  await expect(page.locator('.nt-return-empty')).toContainText('last 7 days')
  await page.getByTestId('settings-trigger').click()
  await page.getByTestId('show-return-pages').click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('return-pages-section')).toHaveCount(0)
  await expect(page.getByTestId('quick-link-card')).toHaveCount(6)
  await page.reload()
  await expect(page.getByTestId('return-pages-section')).toHaveCount(0)
})

test('frequent pages count distinct days and tabs support keyboard selection', async ({
  page,
  context,
  extensionId,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(chrome.history, 'getVisits', {
      value: async ({ url }: { url: string }) => {
        const days = url.includes('/roadmap') ? [0, 1, 2, 3] : url.includes('/pull/183') ? [0, 1] : [0, 0, 0]
        return days.map((day, i) => ({
          id: String(i),
          visitId: String(i),
          visitTime: Date.now() - day * 86400000 - 60000,
          referringVisitId: '0',
          transition: 'link',
        }))
      },
    })
  })
  await prepare(page, context, extensionId)
  const recent = page.getByRole('tab', { name: 'Recent revisits', exact: true })
  await recent.focus()
  await recent.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Frequently visited', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tab', { name: 'Frequently visited', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(visibleRows(page)).toHaveCount(4)
  await expect(visibleRows(page).first()).toContainText('NextTab 产品路线')
  await expect(visibleRows(page).first()).toContainText('4 days')
})

test('site expansion shows open, saved and recent pages and returns focus', async ({ page, context, extensionId }) => {
  await prepare(page, context, extensionId)
  await page.evaluate(() =>
    chrome.bookmarks.create({
      title: 'Saved NextTab architecture',
      url: 'https://github.return.test/NextTab/architecture',
    }),
  )
  const expand = page.getByRole('button', { name: 'Show pages from GitHub', exact: true })
  await expand.focus()
  await expand.press('Enter')
  const dialog = page.getByTestId('site-pages-dialog')
  await expect(dialog.getByRole('heading', { name: 'GitHub', exact: true })).toBeFocused()
  await expect(dialog).toContainText(fixturePages[5].title)
  await expect(dialog).toContainText('Saved NextTab architecture')
  await expect(dialog).toContainText(fixturePages[0].title)
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 320, height: 700 },
    { width: 900, height: 360 },
  ]) {
    await page.setViewportSize(viewport)
    await expect
      .poll(async () => {
        const rectangle = await dialog.boundingBox()
        return (
          rectangle !== null &&
          rectangle.x >= 0 &&
          rectangle.x + rectangle.width <= viewport.width &&
          rectangle.y >= 0 &&
          rectangle.y + rectangle.height <= viewport.height
        )
      })
      .toBe(true)
    const heading = (await dialog.getByRole('heading', { name: 'GitHub', exact: true }).boundingBox())!
    const description = (await dialog.locator('[data-slot="dialog-description"]').boundingBox())!
    expect(description.y - heading.y - heading.height).toBeGreaterThanOrEqual(0)
    expect(description.y - heading.y - heading.height).toBeLessThanOrEqual(2)
    await expect(dialog.locator('[data-slot="dialog-close"]')).toBeInViewport()
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`site-pages-${viewport.width}.png`), fullPage: true })
  }
  await page.keyboard.press('Escape')
  await expect(expand).toBeFocused()
  const longTitle = 'NextTab 项目讨论、产品路线与设计资料 — 页面标题很长时仍能看清完整名称和网站地址'
  const longHost = `${'long-project-name-'.repeat(3)}example.${'team-resources-'.repeat(3)}return.test`
  await page.evaluate(
    async ({ title, host }) => {
      await chrome.storage.local.set({
        'quick-url-item-storage-key': [{ id: 'long-site', title, url: `https://${host}/` }],
      })
      chrome.history.search = async () => [
        { id: 'long-page', title, url: `https://${host}/docs/${'long-path/'.repeat(10)}`, lastVisitTime: Date.now() },
      ]
    },
    { title: longTitle, host: longHost },
  )
  await page.getByRole('button', { name: `Show pages from ${longTitle}`, exact: true }).click()
  for (const viewport of [
    { width: 320, height: 700 },
    { width: 900, height: 360 },
  ]) {
    await page.setViewportSize(viewport)
    await expect(dialog.getByRole('heading', { name: longTitle, exact: true })).toBeInViewport()
    await expect(dialog.locator('[data-slot="dialog-description"]')).toHaveText(longHost)
    await expect(dialog.locator('[data-slot="dialog-close"]')).toBeInViewport()
    await expect(dialog.getByRole('button', { name: 'Open website', exact: true })).toBeInViewport()
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`site-pages-long-${viewport.width}.png`), fullPage: true })
  }
  await page.evaluate(() => chrome.storage.local.set({ 'theme-storage-key': 'dark' }))
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.screenshot({
    path: test.info().outputPath('site-pages-long-dark.png'),
    fullPage: true,
    animations: 'disabled',
  })
})

test('multiple matching tabs prompt for a target instead of opening or closing tabs', async ({
  page,
  context,
  extensionId,
}) => {
  await prepare(page, context, extensionId)
  const duplicate = await context.newPage()
  await duplicate.goto(fixturePages[5].url)
  await page.bringToFront()
  await page.reload()
  await expect(visibleRows(page).first().locator('.nt-return-open')).toHaveAccessibleName(
    `${fixturePages[5].title} — Switch to tab`,
  )
  const count = context.pages().length
  await visibleRows(page).first().locator('.nt-return-open').click()
  await expect(page.getByRole('dialog', { name: 'Choose an open tab' })).toBeVisible()
  await expect(page.locator('.nt-tab-choice')).toHaveCount(2)
  expect(context.pages()).toHaveLength(count)
  await page.keyboard.press('Escape')
  await expect(visibleRows(page).first().locator('.nt-return-open')).toBeFocused()
})

test('website body and expand button show separate hover actions', async ({ page, context, extensionId }) => {
  await prepare(page, context, extensionId)
  const card = page.getByTestId('quick-link-card').first()
  const body = card.locator('.nt-link-open')
  const expand = card.locator('.nt-link-expand')
  const bodyBounds = await body.boundingBox()
  const expandBounds = await expand.boundingBox()
  const cardBounds = await card.boundingBox()
  expect(expandBounds!.height).toBeCloseTo(bodyBounds!.height)
  expect(expandBounds!.y).toBeCloseTo(bodyBounds!.y)
  expect(expandBounds!.x).toBeCloseTo(bodyBounds!.x + bodyBounds!.width)
  expect(expandBounds!.x + expandBounds!.width).toBeCloseTo(cardBounds!.x + cardBounds!.width - 1)
  await body.hover()
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText('GitHub · Open website')
  const primaryBackground = await body.evaluate(element => getComputedStyle(element).backgroundColor)
  expect(primaryBackground).not.toBe('rgba(0, 0, 0, 0)')
  await expand.hover({ position: { x: expandBounds!.width / 2, y: 2 } })
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText('Show pages from GitHub')
  await expect(body).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(expand).toHaveCSS('background-color', primaryBackground)
  await page.screenshot({ path: test.info().outputPath('site-expand-filled-hover.png'), fullPage: true })
  await expand.click({ position: { x: expandBounds!.width / 2, y: expandBounds!.height - 2 } })
  await expect(page.getByTestId('site-pages-dialog')).toBeVisible()
  expect(page.url()).toContain('/newtab.html')
})

test('page row secondary actions fill their height in the homepage and every page list', async ({
  page,
  context,
  extensionId,
}) => {
  await prepare(page, context, extensionId)
  const checkRow = async (row: ReturnType<typeof visibleRows>) => {
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map(animation => animation.finished.catch(() => {})),
      ),
    )
    const primary = row.locator('.nt-return-open')
    const more = row.locator('.nt-return-more')
    const primaryBounds = await primary.boundingBox()
    const moreBounds = await more.boundingBox()
    expect(moreBounds!.height).toBeCloseTo(primaryBounds!.height)
    expect(moreBounds!.y).toBeCloseTo(primaryBounds!.y)
    expect(moreBounds!.x).toBeCloseTo(primaryBounds!.x + primaryBounds!.width)
    await row.hover()
    await more.hover({ position: { x: moreBounds!.width / 2, y: 2 } })
    expect(await more.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
    await expect(primary).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await more.click({ position: { x: moreBounds!.width / 2, y: moreBounds!.height - 2 } })
    await expect(page.getByRole('menuitem', { name: 'Copy link', exact: true })).toBeVisible()
    await expect(page.getByRole('menuitem').locator('svg')).toHaveCount(0)
    expect(page.url()).toContain('/newtab.html')
    await page.keyboard.press('Escape')
    await expect(more).toBeFocused()
  }
  await checkRow(visibleRows(page).first())
  await page.screenshot({ path: test.info().outputPath('return-more-filled-hover.png'), fullPage: true })
  await page.getByTestId('return-view-all').click()
  await checkRow(page.getByRole('dialog').getByTestId('return-page-row').first())
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Show pages from GitHub', exact: true }).click()
  const dialog = page.getByTestId('site-pages-dialog')
  await checkRow(dialog.getByTestId('return-page-row').first())
  await dialog.getByRole('button', { name: 'View Recent History', exact: true }).click()
  await checkRow(dialog.getByTestId('return-page-row').first())
  await page.setViewportSize({ width: 320, height: 700 })
  await checkRow(dialog.getByTestId('return-page-row').first())
  await dialog.getByTestId('return-page-row').first().locator('.nt-return-more').press('Enter')
  await dialog.getByRole('textbox').click()
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(dialog.getByRole('textbox')).toBeFocused()
})

test('selection rules stay behind an accessible info control in view all', async ({ page, context, extensionId }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await prepare(page, context, extensionId)
  await delayReturnLoads(page)
  const recent = page.getByRole('tab', { name: 'Recent revisits', exact: true })
  const frequent = page.getByRole('tab', { name: 'Frequently visited', exact: true })
  await recent.hover()
  await expect(page.locator('[data-slot="tooltip-content"]')).toContainText('last 7 days')
  await frequent.hover()
  await expect(page.locator('[data-slot="tooltip-content"]')).toContainText('last 30 days')
  await expect(recent).toHaveAttribute('aria-selected', 'true')
  await frequent.click()
  await expect(page.locator('.nt-return-pages')).toHaveAttribute('aria-busy', 'true')
  await releaseReturnLoad(page, 1)
  await expect(page.locator('.nt-return-pages')).toHaveAttribute('aria-busy', 'false')
  await page.getByTestId('return-view-all').click()
  const dialog = page.getByRole('dialog', { name: 'Frequently visited', exact: true })
  const info = dialog.getByRole('button', { name: 'Page selection rules', exact: true })
  const rules = page.locator('.nt-return-rules')
  await expect(dialog.getByRole('textbox')).toBeFocused()
  await expect(rules).not.toBeVisible()
  await info.hover()
  await expect(rules).toContainText('Pages you visit often in the last 30 days')
  await expect(rules).toContainText('Duplicate pages are combined')
  await expect(rules).not.toContainText('up to 4 pages')
  await expect(rules).not.toContainText('window height')
  await expect(rules).not.toContainText('Ordering refreshes')
  await page.mouse.move(0, 0)
  await expect(rules).not.toBeVisible()
  await page.keyboard.press('Shift+Tab')
  await expect(info).toBeFocused()
  await expect(rules).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(rules).not.toBeVisible()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(rules).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(rules).not.toBeVisible()
  await page.setViewportSize({ width: 320, height: 700 })
  await expect
    .poll(async () => {
      const rectangle = await dialog.boundingBox()
      return (
        rectangle !== null &&
        rectangle.x >= 0 &&
        rectangle.x + rectangle.width <= 320 &&
        rectangle.y + rectangle.height <= 700
      )
    })
    .toBe(true)
  await expect(dialog.getByRole('textbox')).toBeVisible()
  await info.hover()
  await expect(rules).toBeVisible()
  const tooltipBounds = await rules.boundingBox()
  expect(tooltipBounds).not.toBeNull()
  expect(tooltipBounds!.x).toBeGreaterThanOrEqual(0)
  expect(tooltipBounds!.x + tooltipBounds!.width).toBeLessThanOrEqual(320)
  await page.screenshot({ path: test.info().outputPath('return-rules-narrow.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('site tabs switch and close individually, update counts and keep keyboard focus after a failure or close', async ({
  page,
  context,
  extensionId,
}) => {
  const original = await prepare(page, context, extensionId)
  const duplicate = await context.newPage()
  await duplicate.goto(`${fixturePages[5].url}?view=second`)
  const unrelated = await context.newPage()
  await unrelated.goto(fixturePages[3].url)
  await page.bringToFront()
  const tabIds = await page.evaluate(async () =>
    (await chrome.tabs.query({}))
      .filter(tab => tab.url?.includes('github.return.test/NextTab/pull/183'))
      .map(tab => tab.id!),
  )
  const card = page.getByTestId('quick-link-card').first()
  await expect(card.locator('.nt-link-meta')).toHaveText('2 open tabs')
  await page.setViewportSize({ width: 320, height: 700 })
  await expect(card.locator('.nt-link-meta')).toHaveCSS('white-space', 'normal')
  const labelFits = await card
    .locator('.nt-link-meta')
    .evaluate(element => element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth)
  expect(labelFits).toBe(true)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await card.locator('.nt-link-expand').click()
  const dialog = page.getByTestId('site-pages-dialog')
  await expect(dialog.locator('[data-tab-id]')).toHaveCount(2)
  const originalRow = dialog.locator(`[data-tab-id="${tabIds[0]}"]`)
  const duplicateRow = dialog.locator(`[data-tab-id="${tabIds[1]}"]`)
  await expect(originalRow).toContainText('Tab')
  await originalRow.locator('.nt-return-open').click()
  await expect
    .poll(() => page.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id))
    .toBe(tabIds[0])
  await expect(page.getByRole('dialog', { name: 'Choose an open tab' })).toHaveCount(0)
  await page.bringToFront()
  // A browser API failure must leave the tab in place and permit a keyboard retry.
  await page.evaluate(() => {
    const remove = chrome.tabs.remove.bind(chrome.tabs)
    let first = true
    Object.defineProperty(chrome.tabs, 'remove', {
      value: async (id: number) => {
        if (first) {
          first = false
          throw new Error('Simulated tab removal failure')
        }
        return remove(id)
      },
    })
  })
  const more = duplicateRow.locator('.nt-return-more')
  await more.focus()
  await more.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Close tab', exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('site-close-tab-menu.png'), fullPage: true })
  await page.getByRole('menuitem', { name: 'Close tab', exact: true }).press('Enter')
  await expect(page.getByText("Couldn't close the tab. Please try again.", { exact: true })).toBeVisible()
  await expect(more).toBeFocused()
  expect(duplicate.isClosed()).toBe(false)
  await more.press('Enter')
  const closed = duplicate.waitForEvent('close')
  await page.getByRole('menuitem', { name: 'Close tab', exact: true }).press('Enter')
  await closed
  await expect(duplicateRow).toHaveCount(0)
  await expect(card.locator('.nt-link-meta')).toHaveText('1 open tab')
  await expect(dialog.locator('.nt-return-open:focus')).toHaveCount(1)
  expect(original.isClosed()).toBe(false)
  expect(unrelated.isClosed()).toBe(false)
  await originalRow.locator('.nt-return-more').focus()
  await originalRow.locator('.nt-return-more').press('Enter')
  const lastClosed = original.waitForEvent('close')
  await page.getByRole('menuitem', { name: 'Close tab', exact: true }).press('Enter')
  await lastClosed
  await expect(dialog.locator('[data-tab-id]')).toHaveCount(0)
  await expect(card.locator('.nt-link-meta')).toHaveText('github.return.test')
  expect(unrelated.isClosed()).toBe(false)
  await expect(dialog.locator('.nt-return-open:focus')).toHaveCount(1)
  const historyRow = dialog.locator(`[data-testid="return-page-row"][data-page-url^="${fixturePages[5].url}"]`)
  await expect(historyRow).toHaveCount(1)
  await dialog.getByRole('heading', { name: 'GitHub', exact: true }).focus()
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCount(0)
  await historyRow.hover()
  await historyRow.locator('.nt-return-more').click()
  await expect(page.getByRole('menuitem', { name: 'Close tab', exact: true })).toHaveCount(0)
})

test('query variants appear once, switch to an existing path and copy the full URL', async ({
  page,
  context,
  extensionId,
}) => {
  const diagnostics: string[] = []
  page.on('console', message => {
    if (message.text().startsWith('[NextTab:return-pages]')) diagnostics.push(message.text())
  })
  await prepare(page, context, extensionId, 0)
  const path = 'https://www.bilibili.com/video/BV1znaf61EnS/'
  const original = `${path}?spm_id_from=333.content.click&vd_source=example#player`
  await context.route(`${path}**`, route =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<meta charset="utf-8"><title>Bilibili 同一视频</title>',
    }),
  )
  const target = await context.newPage()
  await target.goto(`${path}?p=2`)
  const visitor = await context.newPage()
  await visitor.goto(original)
  await visitor.close()
  await page.bringToFront()
  await page.reload()
  await expect(visibleRows(page)).toHaveCount(1)
  const row = visibleRows(page).first()
  await expect(row.getByTestId('return-page-row')).toHaveAttribute('data-page-url', original)
  await expect(row.locator('.nt-return-open')).toHaveAccessibleName('Bilibili 同一视频 — Switch to tab')
  await page.evaluate(() => {
    navigator.clipboard.writeText = async value => {
      document.documentElement.dataset.copiedLink = value
    }
  })
  await row.hover()
  await row.getByRole('button', { name: 'More actions for Bilibili 同一视频' }).click()
  await page.getByRole('menuitem', { name: 'Copy link', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-copied-link', original)
  expect(diagnostics.some(message => message.includes(original) && message.includes('pageKey'))).toBe(true)
  const count = context.pages().length
  await row.locator('.nt-return-open').click()
  await expect
    .poll(() => page.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].url))
    .toBe(`${path}?p=2`)
  expect(context.pages()).toHaveLength(count)
})

test('domain history keeps the focused search field outside its scrolling list', async ({
  page,
  context,
  extensionId,
}) => {
  await prepare(page, context, extensionId)
  await page.evaluate(async () => {
    for (let i = 0; i < 30; i++) await chrome.history.addUrl({ url: `https://github.return.test/history/${i}` })
  })
  await page.getByRole('button', { name: 'Show pages from GitHub', exact: true }).click()
  const dialog = page.getByTestId('site-pages-dialog')
  await dialog.getByRole('button', { name: 'View Recent History', exact: true }).click()
  const input = dialog.getByRole('textbox')
  const list = dialog.locator('.nt-site-pages-body')
  // Clicking waits for the history view to settle after its focused footer button unmounts.
  await input.click()
  await expect(input).toBeFocused()
  await expect(list.getByRole('textbox')).toHaveCount(0)
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 800, height: 550 },
    { width: 320, height: 700 },
  ]) {
    await page.setViewportSize(viewport)
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))),
    )
    await expect
      .poll(async () => {
        const field = await input.boundingBox()
        const popup = await dialog.boundingBox()
        return (
          field !== null &&
          popup !== null &&
          field.x - popup.x >= 4 &&
          field.x + field.width + 4 <= popup.x + popup.width
        )
      })
      .toBe(true)
    const before = await input.boundingBox()
    const popup = (await dialog.boundingBox())!
    const margin = Math.min(64, Math.max(24, viewport.height * 0.06))
    expect(popup.y).toBeGreaterThanOrEqual(margin - 1)
    expect(viewport.height - popup.y - popup.height).toBeGreaterThanOrEqual(margin - 1)
    expect(popup.height).toBeLessThanOrEqual(760)
    await list.evaluate(element => {
      element.scrollTop = element.scrollHeight
    })
    await expect(input).toBeFocused()
    const after = await input.boundingBox()
    expect(after!.y).toBeCloseTo(before!.y)
    expect(await input.evaluate(element => getComputedStyle(element).boxShadow)).toContain('2px')
  }
  await page.screenshot({ path: test.info().outputPath('domain-history-focus.png'), fullPage: true })
})

test('long return and tab-choice lists scroll inside dialogs with space above and below', async ({
  page,
  context,
  extensionId,
}) => {
  await prepare(page, context, extensionId)
  await page.evaluate(async () => {
    for (let i = 0; i < 24; i++) await chrome.history.addUrl({ url: `https://github.return.test/history/${i}` })
  })
  for (let i = 0; i < 12; i++) {
    const duplicate = await context.newPage()
    await duplicate.goto(`${fixturePages[5].url}?view=${i}`)
  }
  await page.bringToFront()
  await page.reload()
  await expect(page.locator('.nt-return-pages')).toHaveAttribute('aria-busy', 'false')
  await page.getByTestId('return-view-all').click()
  const all = page.locator('.nt-return-all-dialog')
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 900, height: 550 },
    { width: 320, height: 700 },
  ]) {
    await page.setViewportSize(viewport)
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map(animation => animation.finished.catch(() => {})),
      ),
    )
    const bounds = (await all.boundingBox())!
    const margin = Math.min(64, Math.max(24, viewport.height * 0.06))
    expect(bounds.y).toBeGreaterThanOrEqual(margin - 1)
    expect(viewport.height - bounds.y - bounds.height).toBeGreaterThanOrEqual(margin - 1)
    const inputBefore = await all.getByRole('textbox').boundingBox()
    await all.locator('.nt-return-all-list').evaluate(element => {
      element.scrollTop = element.scrollHeight
    })
    const inputAfter = await all.getByRole('textbox').boundingBox()
    expect(inputAfter!.y).toBeCloseTo(inputBefore!.y)
    await all.getByTestId('return-page-row').last().locator('.nt-return-open').focus()
    await expect(all.getByTestId('return-page-row').last().locator('.nt-return-open')).toBeInViewport()
  }
  expect(
    await page.evaluate(
      async () =>
        (await chrome.tabs.query({})).filter(tab => tab.url?.includes('github.return.test/NextTab/pull/183')).length,
    ),
  ).toBe(13)
  await all.getByRole('textbox').fill(new URL(fixturePages[5].url).pathname)
  await all.locator(`[data-page-url^="${fixturePages[5].url}"] .nt-return-open`).click()
  const choices = page.locator('.nt-page-choice-dialog')
  await expect(choices.locator('.nt-tab-choice')).toHaveCount(13)
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => {})),
    ),
  )
  const bounds = (await choices.boundingBox())!
  expect(bounds.y).toBeGreaterThanOrEqual(41)
  expect(700 - bounds.y - bounds.height).toBeGreaterThanOrEqual(41)
  const headingBefore = await choices.getByRole('heading').boundingBox()
  await choices.locator('.nt-tab-choice').last().focus()
  await expect(choices.locator('.nt-tab-choice').last()).toBeInViewport()
  expect((await choices.getByRole('heading').boundingBox())!.y).toBeCloseTo(headingBefore!.y)
  await page.screenshot({ path: test.info().outputPath('tab-choice-spaced.png'), fullPage: true })
})

test('native tab events write paired activity logs and recommendation queries score their recorded durations', async ({
  page,
  context,
  extensionId,
}) => {
  const errors: string[] = []
  const reports: { stage: string; ranking?: string; activityDiagnostics?: ActivityScoreDiagnostic[] }[] = []
  page.on('console', message => {
    const prefix = '[NextTab:return-pages]'
    if (message.text().startsWith(prefix)) reports.push(JSON.parse(message.text().slice(prefix.length).trim()))
  })
  page.on('pageerror', error => errors.push(error.message))
  const visitor = await prepare(page, context, extensionId, 1, true)
  for (let i = 0; i < 2; i++) {
    await visitor.bringToFront()
    await expect
      .poll(async () => {
        const snapshot = await activitySnapshot(page)
        const active = snapshot.events.find(event => event.viewId === snapshot.activeViewId && event.type === 'enter')
        return snapshot.pages.find(value => value.id === active?.pageId)?.key
      })
      .toBe(fixturePages[0].url)
    await page.bringToFront()
    await expect.poll(async () => (await activitySnapshot(page)).activeViewId).toBeNull()
  }
  const snapshot = await activitySnapshot(page)
  const target = snapshot.pages.find(value => value.key === fixturePages[0].url)!
  const completed = snapshot.events
    .filter(event => event.pageId === target.id && event.type === 'enter')
    .flatMap(enter => {
      const leave = snapshot.events.find(event => event.viewId === enter.viewId && event.type === 'leave')
      return leave ? [{ enter, leave }] : []
    })
    .slice(-2)
  expect(completed).toHaveLength(2)
  expect(completed.every(view => view.leave.at >= view.enter.at)).toBe(true)
  expect(completed.some(view => view.enter.source === 'tab')).toBe(true)
  // Keep native event identities and pairing, but give the isolated fixture known elapsed times.
  // This verifies known daily duration contributions along the real recommendation path.
  await page.evaluate(async pairs => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('nexttab-page-activity', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('events', 'readwrite')
    const events = transaction.objectStore('events')
    const now = Date.now()
    pairs.forEach((pair, index) => {
      for (const [eventId, offset] of [
        [pair.enter.id, 0],
        [pair.leave.id, 60_000],
      ]) {
        const request = events.get(eventId)
        request.onsuccess = () =>
          events.put({ ...request.result, at: now - (index === 0 ? 600_000 : 180_000) + offset })
      }
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()
  }, completed)
  await page.reload()
  await expect(page.locator('.nt-return-pages')).toHaveAttribute('aria-busy', 'false')
  await expect(visibleRows(page)).toHaveCount(1)
  await expect(visibleRows(page)).toContainText(fixturePages[0].title)
  const report = reports.findLast(value => value.stage === 'ranking' && value.ranking === 'foreground-usage')!
  const detail = report.activityDiagnostics!.find(value => value.pageKey === fixturePages[0].url)!
  expect(detail.eligible).toBe(true)
  expect(detail.usage!.views).toBeGreaterThanOrEqual(2)
  expect(detail.usage!.totalSeconds).toBeGreaterThanOrEqual(120)
  expect(detail.breakdown!.days.reduce((sum, day) => sum + day.score, 0)).toBeCloseTo(detail.usage!.score, 10)
  expect(reports.some(value => value.stage === 'display')).toBe(true)
  const row = visibleRows(page).first()
  await row.locator('.nt-return-open').focus()
  await row.locator('.nt-return-more').press('Enter')
  await page.getByRole('menuitem', { name: 'Page details', exact: true }).press('Enter')
  const details = page.getByTestId('page-details-dialog')
  await expect(details.locator('.nt-page-details-body')).toHaveAttribute('aria-busy', 'false')
  expect(
    Number(
      await details
        .locator('.nt-page-detail-metric')
        .filter({ has: page.getByText('Views', { exact: true }) })
        .locator('dd')
        .innerText(),
    ),
  ).toBeGreaterThanOrEqual(2)
  await expect(
    details
      .locator('.nt-page-detail-metric')
      .filter({ has: page.getByText('Total foreground time', { exact: true }) })
      .locator('dd'),
  ).toHaveText(/2 min/)
  await expect(details.locator('.nt-page-details-ranking')).toHaveCount(0)
  await details.getByRole('button', { name: 'About usage records', exact: true }).focus()
  await expect(page.locator('.nt-return-rules[data-open]')).toContainText('recorded independently')
  await page.keyboard.press('Escape')
  await expect(details).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(row.locator('.nt-return-more')).toBeFocused()
  await page.getByTestId('return-view-all').click()
  await expect(
    page.getByRole('dialog', { name: 'Recent revisits', exact: true }).getByTestId('return-page-row'),
  ).toHaveCount(1)
  await page.keyboard.press('Escape')
  const scoredSnapshot = await activitySnapshot(page)
  expect(scoredSnapshot.bytes).toBeLessThanOrEqual(2 * 1024 * 1024)
  await page.evaluate(() => chrome.history.deleteAll())
  await expect(visibleRows(page)).toHaveCount(0)
  await expect.poll(async () => (await activitySnapshot(page)).events.length).toBe(0)
  expect(errors).toEqual([])
})

test('live brief tab returns are scored independently without altering event timestamps', async ({
  page,
  context,
  extensionId,
}) => {
  const reports: { stage: string; ranking?: string; activityDiagnostics?: ActivityScoreDiagnostic[] }[] = []
  page.on('console', message => {
    const prefix = '[NextTab:return-pages]'
    if (message.text().startsWith(prefix)) reports.push(JSON.parse(message.text().slice(prefix.length).trim()))
  })
  const visitor = await prepare(page, context, extensionId, 1, true)
  const before = await activitySnapshot(page)
  const activeTarget = async () => {
    const snapshot = await activitySnapshot(page)
    const enter = snapshot.events.find(event => event.viewId === snapshot.activeViewId && event.type === 'enter')
    return snapshot.pages.find(value => value.id === enter?.pageId)?.key
  }
  // Real native activations and elapsed durations; no thirty-second wait or backdated events.
  for (let i = 0; i < 2; i++) {
    await visitor.bringToFront()
    await expect.poll(activeTarget).toBe(fixturePages[0].url)
    await visitor.waitForTimeout(1100)
    await page.bringToFront()
    await expect.poll(async () => (await activitySnapshot(page)).activeViewId).toBeNull()
  }
  const snapshot = await activitySnapshot(page)
  const target = snapshot.pages.find(value => value.key === fixturePages[0].url)!
  const recordedViews = snapshot.events
    .filter(event => event.pageId === target.id && event.type === 'enter')
    .flatMap(enter => {
      const leave = snapshot.events.find(event => event.viewId === enter.viewId && event.type === 'leave')
      return leave && leave.at > enter.at
        ? [{ source: enter.source, start: enter.at, end: leave.at, seconds: (leave.at - enter.at) / 1000 }]
        : []
    })
  expect(recordedViews.slice(-2).every(view => view.seconds >= 1.1 && view.seconds < 30)).toBe(true)
  expect(recordedViews.length).toBeGreaterThanOrEqual(2)
  expect(recordedViews.at(-1)!.start - recordedViews.at(-2)!.end).toBeLessThan(30_000)
  expect(snapshot.events.filter(event => event.id <= Math.max(...before.events.map(event => event.id)))).toEqual(
    before.events,
  )
  await expect
    .poll(() => {
      const report = reports.findLast(value => value.stage === 'ranking' && value.ranking === 'foreground-usage')
      return report?.activityDiagnostics?.find(value => value.pageKey === fixturePages[0].url)?.usage?.views
    })
    .toBe(recordedViews.length)
  await expect(visibleRows(page)).toContainText(fixturePages[0].title)

  const row = visibleRows(page).first()
  await row.locator('.nt-return-open').focus()
  await row.locator('.nt-return-more').press('Enter')
  await page.getByRole('menuitem', { name: 'Page details', exact: true }).press('Enter')
  const details = page.getByTestId('page-details-dialog')
  await expect(details.locator('.nt-page-details-body')).toHaveAttribute('aria-busy', 'false')
  const metric = (label: string) =>
    details
      .locator('.nt-page-detail-metric')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator('dd')
  await expect(metric('Views')).toHaveText(String(recordedViews.length))
  await expect(metric('Total foreground time')).not.toHaveText(/^(0 sec|—)$/)
  await expect(metric('Active days')).toHaveText('1')
  await expect(metric('Last used')).toContainText('now')
  await expect(page.locator('.nt-return-rules[data-open]')).toHaveCount(0)
  await expect
    .poll(() =>
      details.evaluate(dialog => {
        const icon = dialog.querySelector('.nt-page-details-icon')!.getBoundingClientRect()
        const identity = dialog.querySelector('.nt-page-details-identity > div')!.getBoundingClientRect()
        return Math.abs(icon.y + icon.height / 2 - identity.y - identity.height / 2)
      }),
    )
    .toBeLessThan(1)
  await details.getByRole('button', { name: 'About usage records', exact: true }).click()
  await expect(page.locator('.nt-return-rules[data-open]')).toContainText('recorded independently')
  await page.keyboard.press('Escape')
  await expect(details).toBeVisible()
  await details.getByRole('button', { name: 'About browsing records', exact: true }).focus()
  await expect(page.locator('.nt-return-rules[data-open]')).toContainText('not simply returning to an open tab')
  await page.keyboard.press('Escape')
  await expect(details).toBeVisible()
  await expect(metric('Visits')).toHaveText('1')
  await test.info().attach('live-foreground-records', {
    body: JSON.stringify({ recordedViews, displayedTotal: await metric('Total foreground time').innerText() }, null, 2),
    contentType: 'application/json',
  })
  await page.mouse.move(1400, 950)
  await page.screenshot({ path: test.info().outputPath('page-details-live.png'), fullPage: true })

  // Navigating an existing tab to a different page ends the old stay and starts scoring the new path.
  await page.keyboard.press('Escape')
  await visitor.bringToFront()
  await visitor.goto(fixturePages[2].url)
  await expect.poll(activeTarget).toBe(fixturePages[2].url)
  await visitor.waitForTimeout(1100)
  await page.bringToFront()
  await expect
    .poll(() => {
      const report = reports.findLast(value => value.stage === 'ranking' && value.ranking === 'foreground-usage')
      return report?.activityDiagnostics?.find(value => value.pageKey === fixturePages[2].url)?.usage?.score ?? 0
    })
    .toBeGreaterThan(0)
  await expect(visibleRows(page)).toHaveCount(2)
  await page.getByTestId('return-view-all').click()
  const all = page.getByRole('dialog', { name: 'Recent revisits', exact: true })
  await expect(all.getByTestId('return-page-row')).toHaveCount(2)
  await expect(all).toContainText(fixturePages[0].title)
  await expect(all).toContainText(fixturePages[2].title)
})

test('page details distinguish missing usage from history, support nested dialogs and recover from partial failures', async ({
  page,
  context,
  extensionId,
}) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await prepare(page, context, extensionId)
  await page.evaluate(() => {
    const sendMessage = chrome.runtime.sendMessage.bind(chrome.runtime)
    Object.defineProperty(chrome.runtime, 'sendMessage', {
      value: (message: { type: string }) =>
        message.type === 'nexttab:page-activity-snapshot'
          ? Promise.resolve({ pages: [], events: [], activeViewId: null, now: Date.now(), bytes: 0 })
          : sendMessage(message),
    })
  })
  const openDetails = async (row: ReturnType<typeof visibleRows>) => {
    await row.locator('.nt-return-open').focus()
    await row.locator('.nt-return-more').press('Enter')
    await page.getByRole('menuitem', { name: 'Page details', exact: true }).press('Enter')
    const details = page.getByTestId('page-details-dialog')
    await expect(details).toBeVisible()
    await expect(details.getByRole('heading', { name: 'Page details', exact: true })).toBeFocused()
    await expect(details.locator('.nt-page-details-body')).toHaveAttribute('aria-busy', 'false')
    return details
  }
  const homeRow = visibleRows(page).first()
  let details = await openDetails(homeRow)
  const metric = (label: string) =>
    details
      .locator('.nt-page-detail-metric')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator('dd')
  await expect(metric('Visits')).toHaveText('1')
  await expect(metric('Views')).toHaveText('—')
  await expect(details).toContainText('No foreground records are available yet')
  await expect(details.locator('.nt-page-details-ranking')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(homeRow.locator('.nt-return-more')).toBeFocused()
  await page.getByTestId('return-view-all').click()
  const parent = page.locator('.nt-return-all-dialog')
  await parent.getByRole('textbox').fill('NextTab')
  const parentRow = parent.getByTestId('return-page-row').last()
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 320, height: 700 },
    { width: 900, height: 360 },
  ]) {
    // Resize while details are open so the parent focus target becomes clipped deterministically.
    await page.setViewportSize({ ...viewport, height: viewport.height === 360 ? 700 : viewport.height })
    await parentRow.locator('.nt-return-open').focus()
    details = await openDetails(parentRow)
    await page.setViewportSize(viewport)
    const scrollBefore = await parent.locator('.nt-return-all-list').evaluate(element => element.scrollTop)
    await expect(parent).not.toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map(animation => animation.finished.catch(() => {})),
      ),
    )
    const bounds = (await details.boundingBox())!
    const margin = Math.min(64, Math.max(24, viewport.height * 0.06))
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
    expect(bounds.y).toBeGreaterThanOrEqual(margin - 1)
    expect(viewport.height - bounds.y - bounds.height).toBeGreaterThanOrEqual(margin - 1)
    const titleBefore = (await details.getByRole('heading', { name: 'Page details', exact: true }).boundingBox())!
    await details.locator('.nt-page-details-body').evaluate(element => {
      element.scrollTop = element.scrollHeight
    })
    await expect(details.locator('.nt-page-details-asof')).toBeInViewport()
    await expect(details.locator('[data-slot="dialog-close"]')).toBeInViewport()
    expect((await details.getByRole('heading', { name: 'Page details', exact: true }).boundingBox())!.y).toBeCloseTo(
      titleBefore.y,
    )
    expect(await details.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`page-details-${viewport.width}.png`), fullPage: true })
    await page.keyboard.press('Escape')
    await expect(parent).toBeVisible()
    await expect(parentRow.locator('.nt-return-more')).toBeFocused()
    await expect(parentRow.locator('.nt-return-more')).toBeInViewport({ ratio: 1 })
    await expect(parent.getByRole('textbox')).toHaveValue('NextTab')
    // Preserve the existing position when it fits; a shorter window reveals the restored focus target.
    const scrollAfter = await parent.locator('.nt-return-all-list').evaluate(element => element.scrollTop)
    if (viewport.height === 360) expect(scrollAfter).toBeGreaterThan(scrollBefore)
    else expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(16)
  }
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Show pages from GitHub', exact: true }).click()
  const site = page.getByTestId('site-pages-dialog')
  const siteRow = site.getByTestId('return-page-row').first()
  details = await openDetails(siteRow)
  await expect(site).not.toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(site).toBeVisible()
  await expect(siteRow.locator('.nt-return-more')).toBeFocused()
  await page.evaluate(() =>
    Object.defineProperty(chrome.history, 'search', { value: () => Promise.reject(new Error('History unavailable')) }),
  )
  details = await openDetails(siteRow)
  await expect(details).toContainText('Browser history is temporarily unavailable')
  await expect(metric('Visits')).toHaveText('—')
  expect(errors).toEqual([])
})
