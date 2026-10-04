import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActivitySnapshot } from '@/utils/page-activity/model'
import type { ActivityScoreDiagnostic } from '@/utils/page-activity/scoring'
import {
  buildReturnPages,
  buildVisitedPages,
  fetchReturnPages,
  filterReturnPages,
  groupPageTabs,
  isReturnablePage,
  logReturnPageDisplay,
  matchingPageTabs,
  normalizePageUrl,
  OPEN_TAB_MULTIPLIER,
  rankRecentPages,
  RETURN_PAGE_LOG_LIMIT,
} from './return-pages'

const now = new Date(2026, 9, 1, 12).getTime()
const ago = (days: number) => {
  const date = new Date(now)
  date.setDate(date.getDate() - days)
  return date.getTime()
}
const history = (url: string, days = 0, title = url): chrome.history.HistoryItem => ({
  id: url,
  url,
  title,
  lastVisitTime: ago(days),
  visitCount: 100,
})
const visits = (...times: number[]): chrome.history.VisitItem[] =>
  times.map((visitTime, i) => ({
    id: String(i),
    visitId: String(i),
    visitTime,
    referringVisitId: '0',
    transition: 'link',
  }))
const preferences = { hiddenUrls: [], excludedHosts: [] }
const tab = (url: string, incognito = false) => ({ url, incognito }) as chrome.tabs.Tab
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('return pages', () => {
  it('multiplies usage by 1.3 once across query variants and windows without modifying or stacking usage', () => {
    const url = 'https://github.com/N0I0C0K'
    const pages = [
      {
        id: url,
        url,
        title: 'GitHub',
        lastVisitTime: now - 1000,
        activeDays: 1,
        usage: {
          score: 57.980148156308964,
          views: 12,
          tabSwitches: 12,
          medianSeconds: 3.5775,
          totalSeconds: 137.723,
          activeDays: 1,
          lastUsedAt: now - 1000,
        },
      },
    ]
    const opened = rankRecentPages(pages, [
      { ...tab(`${url}?ref=a#intro`), windowId: 1 },
      { ...tab(`${url}?ref=b`), windowId: 2, discarded: true, pinned: true },
    ])
    expect(opened).toHaveLength(1)
    expect(opened[0].openTabMultiplier).toBe(1.3)
    expect(opened[0].rankingScore).toBeCloseTo(75.37419260320166, 10)
    expect(opened[0].usage).toEqual(pages[0].usage)
    expect(rankRecentPages(opened, [tab(url)])[0].rankingScore).toBe(opened[0].rankingScore)
    expect(rankRecentPages(opened, [])[0]).toMatchObject({ openTabMultiplier: 1, rankingScore: 57.980148156308964 })
    expect(pages[0]).not.toHaveProperty('rankingScore')
  })

  it('includes open pages without inventing activity and distinguishes origins and paths', () => {
    const pages = buildReturnPages([history('https://site.example/doc')], 'recent', new Map(), now)
    const ranked = rankRecentPages(pages, [
      tab('https://site.example/other?ref=a'),
      tab('https://site.example/other?ref=b#intro'),
      { ...tab(''), url: undefined, pendingUrl: 'http://site.example/doc' },
      tab('chrome://newtab/'),
      tab('https://user:secret@site.example/doc'),
    ])
    expect(ranked).toHaveLength(3)
    expect(ranked.find(page => page.id === 'https://site.example/doc')).toMatchObject({
      openTabMultiplier: 1,
      rankingScore: 0,
    })
    const opened = ranked.filter(page => page.openTabMultiplier === OPEN_TAB_MULTIPLIER)
    expect(opened).toHaveLength(2)
    expect(opened.every(page => page.rankingScore === 0 && !page.usage)).toBe(true)
    expect(opened.every(page => page.lastVisitTime === 0 && page.activeDays === 0)).toBe(true)
  })

  it.each([false, true])(
    'uses the current page’s profile for the open-tab multiplier (incognito: %s)',
    async incognito => {
      vi.spyOn(Date, 'now').mockReturnValue(now)
      const logger = vi.spyOn(console, 'info').mockImplementation(() => {})
      const regular = 'https://site.example/regular'
      const privatePage = 'https://site.example/private'
      vi.stubGlobal('chrome', {
        extension: { inIncognitoContext: false },
        history: { search: vi.fn().mockResolvedValue([history(regular), history(privatePage)]) },
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({
            now,
            bytes: 0,
            activeViewId: null,
            pages: [regular, privatePage].map((url, index) => ({ id: index + 1, key: url, url, title: url })),
            events: [regular, privatePage].flatMap((_url, index) => {
              const enter = {
                id: index * 2 + 1,
                viewId: String(index),
                pageId: index + 1,
                type: 'enter',
                source: 'tab',
                at: now - 60000,
              }
              return [enter, { ...enter, id: enter.id + 1, type: 'leave', at: now - 59000 }]
            }),
          }),
        },
        tabs: {
          query: vi.fn().mockResolvedValue([tab(regular), tab(privatePage, true)]),
          getCurrent: vi.fn().mockResolvedValue({ incognito }),
        },
      })
      const pages = await fetchReturnPages('recent')
      expect(pages[0]).toMatchObject({ id: incognito ? privatePage : regular, openTabMultiplier: 1.3 })
      expect(pages[1].openTabMultiplier).toBe(1)
      expect(pages[0].rankingScore).toBeCloseTo(pages[0].usage!.score * 1.3, 10)
      expect(pages[1].rankingScore).toBe(pages[1].usage!.score)
      const report = JSON.parse(logger.mock.calls[0][1])
      expect(report).toMatchObject({ openTabsStatus: 'available' })
      expect(report.candidates[0]).toMatchObject({
        usageScore: pages[0].usage!.score,
        openTabMultiplier: 1.3,
        score: pages[0].rankingScore,
      })
      logReturnPageDisplay('recent', pages, preferences, 4)
      expect(JSON.parse(logger.mock.calls[1][1]).pages[0]).toMatchObject({
        openTabMultiplier: 1.3,
        score: pages[0].rankingScore,
      })
    },
  )

  it('keeps history recommendations if querying tabs fails and still respects hidden open pages', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const url = 'https://site.example/doc'
    vi.stubGlobal('chrome', {
      history: { search: vi.fn().mockResolvedValue([history(url)]) },
      tabs: {
        query: vi.fn().mockRejectedValue(new Error('Unavailable')),
        getCurrent: vi.fn().mockResolvedValue(undefined),
      },
    })
    const pages = await fetchReturnPages('recent')
    expect(pages).toEqual([expect.objectContaining({ id: url, openTabMultiplier: 1, rankingScore: 0 })])
    const opened = rankRecentPages(pages, [tab(url)])
    expect(filterReturnPages(opened, { hiddenUrls: [url], excludedHosts: [] })).toEqual([])
  })

  it('reports a history failure instead of replacing the list with unscored open tabs', async () => {
    vi.stubGlobal('chrome', {
      history: { search: vi.fn().mockRejectedValue(new Error('History unavailable')) },
      runtime: { sendMessage: vi.fn().mockResolvedValue({ now, pages: [], events: [], activeViewId: null, bytes: 0 }) },
      tabs: {
        query: vi.fn().mockResolvedValue([tab('https://site.example/doc')]),
        getCurrent: vi.fn().mockResolvedValue(undefined),
      },
    })
    await expect(fetchReturnPages('recent')).rejects.toThrow('History unavailable')
  })

  it('reports the final displayed order and the same exclusion reasons used by UI filtering', () => {
    const logger = vi.spyOn(console, 'info').mockImplementation(() => {})
    const pages = buildReturnPages(
      [
        history('https://saved.example/'),
        history('https://hidden.example/doc?ref=1'),
        history('https://excluded.example/doc'),
        history('https://visible.example/a'),
        history('https://visible.example/b'),
      ],
      'recent',
      new Map(),
      now,
    )
    const preferences = { hiddenUrls: ['https://hidden.example/doc'], excludedHosts: ['excluded.example'] }
    logReturnPageDisplay('recent', pages, preferences, 1)
    const detail = JSON.parse(logger.mock.calls[0][1])
    expect(detail.stage).toBe('display')
    expect(
      detail.pages
        .filter((page: { displayRank: number | null }) => page.displayRank !== null)
        .map((page: { pageKey: string }) => page.pageKey),
    ).toEqual(filterReturnPages(pages, preferences).map(page => page.id))
    expect([...detail.pages, ...detail.excludedSample].map((page: { reason: string }) => page.reason).sort()).toEqual([
      'excluded-site',
      'hidden-page',
      'shown-on-home',
      'view-all-only',
      'view-all-only',
    ])
    expect(detail.pages.every((page: { score: number | null }) => page.score === null)).toBe(true)
  })

  it('limits ranking and display logs to leading samples while reporting omitted totals', async () => {
    const logger = vi.spyOn(console, 'info').mockImplementation(() => {})
    const history = Array.from({ length: 80 }, (_, index) => ({
      id: String(index),
      url: `https://site.example/${index}`,
      title: `Page ${index}`,
      lastVisitTime: Date.now() - index * 1000,
    }))
    vi.stubGlobal('chrome', { history: { search: vi.fn().mockResolvedValue(history) } })
    const pages = await fetchReturnPages('recent')
    const ranking = JSON.parse(logger.mock.calls[0][1])
    expect(pages).toHaveLength(80)
    expect(ranking.candidates).toHaveLength(RETURN_PAGE_LOG_LIMIT)
    expect(ranking.history.length).toBeLessThanOrEqual(RETURN_PAGE_LOG_LIMIT)
    expect(ranking).toMatchObject({ candidateCount: 80, omittedCandidates: 75 })
    expect(new TextEncoder().encode(logger.mock.calls[0][1]).length).toBeLessThan(10 * 1024)
    logReturnPageDisplay('recent', pages, preferences, 4)
    const display = JSON.parse(logger.mock.calls[1][1])
    expect(display.pages).toHaveLength(RETURN_PAGE_LOG_LIMIT)
    expect(display).toMatchObject({ total: 80, includedCount: 80, omittedPages: 75 })
  })

  it('keeps single visits and different pages on the same website in recent order', () => {
    const input = [history('https://site.example/older', 2), history('https://site.example/new', 0)]
    expect(buildReturnPages(input, 'recent', new Map(), now).map(page => page.title)).toEqual([
      'https://site.example/new',
      'https://site.example/older',
    ])
    expect(input[0].url).toBe('https://site.example/older')
  })

  it('groups query and fragment variants by website and path, preserving the newest full URL', () => {
    const pages = buildReturnPages(
      [
        history('https://site.example/page?id=1#section', 2),
        history('https://site.example/page?id=2#section', 1),
        history('https://site.example/page?id=1#other', 0),
        history('https://site.example/page?id=1&utm_source=test#section', 3),
        history('https://site.example/another?id=1#section'),
        history('https://another.example/page?id=1#section'),
      ],
      'recent',
      new Map(),
      now,
    )
    expect(pages).toHaveLength(3)
    expect(pages.find(page => page.id === 'https://site.example/page')?.url).toBe(
      'https://site.example/page?id=1#other',
    )
    expect(normalizePageUrl('https://site.example/page?id=1&utm_source=test#section')).toBe('https://site.example/page')
  })

  it('groups Bilibili referral links and part parameters without rewriting the navigation URL', () => {
    const original = 'https://www.bilibili.com/video/BV1znaf61EnS/?spm_id_from=333.content.click&vd_source=source'
    const result = buildReturnPages(
      [history('https://www.bilibili.com/video/BV1znaf61EnS/?p=2', 1), history(original)],
      'recent',
      new Map(),
      now,
    )
    expect(result).toEqual([
      expect.objectContaining({ id: 'https://www.bilibili.com/video/BV1znaf61EnS/', url: original }),
    ])
  })

  it('rejects internal, invalid and credentialed URLs without guessing from page paths', () => {
    for (const url of [
      'bad',
      'chrome://newtab/',
      'chrome-extension://abc/newtab.html',
      'https://user:secret@site.example/page',
    ])
      expect(isReturnablePage(url)).toBe(false)
    expect(isReturnablePage('https://site.example/login-guide?search=login#examples')).toBe(true)
    expect(isReturnablePage('https://site.example/login')).toBe(true)
    expect(isReturnablePage('https://site.example/#/oauth/callback')).toBe(true)
  })

  it('does not fill recent pages from older history or missing timestamps', () => {
    expect(
      buildReturnPages(
        [history('https://site.example/old', 8), { id: 'missing', url: 'https://site.example/missing' }],
        'recent',
        new Map(),
        now,
      ),
    ).toEqual([])
  })

  it('counts distinct days within 30 days, not lifetime visit counts or reloads', () => {
    const one = 'https://site.example/one'
    const many = 'https://site.example/many'
    const data = new Map([
      [one, visits(ago(0), ago(0), ago(0), ago(40))],
      [many, visits(ago(0), ago(1), ago(1), ago(3))],
    ])
    const result = buildReturnPages([history(one), history(many)], 'frequent', data, now)
    expect(result).toEqual([
      expect.objectContaining({ url: many, activeDays: 3 }),
      expect.objectContaining({ url: one, activeDays: 1 }),
    ])
  })

  it('unions visit days across all query variants without counting the same day twice', () => {
    const first = 'https://site.example/doc?utm_source=a'
    const second = 'https://site.example/doc?utm_source=b'
    const result = buildReturnPages(
      [history(first), history(second, 1)],
      'frequent',
      new Map([
        [first, visits(ago(0), ago(1))],
        [second, visits(ago(1), ago(2))],
      ]),
      now,
    )
    expect(result).toHaveLength(1)
    expect(result[0].activeDays).toBe(3)
  })

  it('ranks frequent pages by days and then recency, independently of saved status', () => {
    const a = 'https://site.example/a',
      b = 'https://site.example/b',
      c = 'https://site.example/c'
    const result = buildReturnPages(
      [history(a, 1), history(b), history(c, 2)],
      'frequent',
      new Map([
        [a, visits(ago(1), ago(2))],
        [b, visits(ago(0), ago(1))],
        [c, visits(ago(2), ago(3), ago(4))],
      ]),
      now,
    )
    expect(result.map(page => page.url)).toEqual([c, b, a])
  })

  it('preserves homepages and deep pages, applying only explicit user feedback', () => {
    const pages = buildReturnPages(
      [history('https://site.example/'), history('https://site.example/doc'), history('https://other.example/doc')],
      'recent',
      new Map(),
      now,
    )
    expect(filterReturnPages(pages, preferences).map(page => page.url)).toEqual([
      'https://other.example/doc',
      'https://site.example/',
      'https://site.example/doc',
    ])
    expect(
      filterReturnPages(pages, {
        hiddenUrls: ['https://site.example/doc?utm_source=foo'],
        excludedHosts: ['other.example'],
      }),
    ).toEqual([expect.objectContaining({ url: 'https://site.example/' })])
  })

  it('loads recent pages without fetching visit-day statistics', async () => {
    const getVisits = vi.fn()
    vi.stubGlobal('chrome', {
      history: {
        search: vi
          .fn()
          .mockResolvedValue([{ ...history('https://site.example/doc'), lastVisitTime: Date.now() - 1000 }]),
        getVisits,
      },
    })
    expect(await fetchReturnPages('recent')).toHaveLength(1)
    expect(getVisits).not.toHaveBeenCalled()
  })

  it('orders recently visited pages by their latest logged enter without scoring or recommendation filters', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const urls = ['old', 'long-usage', 'closed', 'active', 'unvisited'].map(path => `https://site.example/${path}`)
    const snapshot: ActivitySnapshot = {
      now,
      bytes: 0,
      activeViewId: 'active',
      pages: urls.map((url, index) => ({ id: index + 1, key: url, url, title: url })),
      events: [
        { id: 1, viewId: 'old', pageId: 1, type: 'enter', at: ago(9), source: 'tab' },
        { id: 2, viewId: 'long', pageId: 2, type: 'enter', at: now - 3600_000, source: 'tab' },
        { id: 3, viewId: 'closed', pageId: 3, type: 'enter', at: now - 2000, source: 'tab' },
        { id: 4, viewId: 'closed', pageId: 3, type: 'leave', at: now - 1900, source: 'tab' },
        { id: 5, viewId: 'active', pageId: 4, type: 'enter', at: now - 1000, source: 'window' },
        { id: 6, viewId: 'long', pageId: 2, type: 'leave', at: now - 500, source: 'window' },
        { id: 7, viewId: 'older-closed', pageId: 3, type: 'enter', at: ago(1), source: 'tab' },
      ],
    }
    const search = vi.fn().mockResolvedValue([history('https://site.example/history-only')])
    const getVisits = vi.fn()
    const sendMessage = vi.fn().mockResolvedValue(snapshot)
    const query = vi.fn()
    vi.stubGlobal('chrome', {
      extension: { inIncognitoContext: false },
      history: { search, getVisits },
      runtime: { sendMessage },
      tabs: { query },
    })
    const pages = await fetchReturnPages('history')
    expect(pages.map(page => page.url)).toEqual([urls[3], urls[2], urls[1], urls[0]])
    expect(pages).toEqual(buildVisitedPages(snapshot))
    expect(sendMessage).toHaveBeenCalledWith({ type: 'nexttab:page-activity-snapshot', incognito: false })
    expect(search).not.toHaveBeenCalled()
    expect(getVisits).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
    expect(pages.every(page => !page.usage && !page.openTabMultiplier && !page.rankingScore)).toBe(true)
    expect(filterReturnPages(pages, { hiddenUrls: [pages[0].url], excludedHosts: ['site.example'] }, 'history')).toBe(
      pages,
    )
    logReturnPageDisplay('history', pages, { hiddenUrls: [pages[0].url], excludedHosts: ['site.example'] }, 4)
    const report = JSON.parse(vi.mocked(console.info).mock.calls[1][1])
    expect(report).toMatchObject({ includedCount: pages.length, excludedCount: 0 })
  })

  it('matches history rows by their full URL while recommendations still match paths', async () => {
    const first = 'https://site.example/page?id=1#intro'
    const second = 'https://site.example/page?id=2#intro'
    const tabs = [tab(first), tab(second), tab('file:///C:/example/report.html')]
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn().mockResolvedValue(tabs), getCurrent: vi.fn().mockResolvedValue(undefined) },
    })
    expect(groupPageTabs(tabs, true).get(first)).toEqual([tabs[0]])
    expect(groupPageTabs(tabs, true).get('file:///C:/example/report.html')).toEqual([tabs[2]])
    expect(await matchingPageTabs(first, true)).toEqual([tabs[0]])
    expect(await matchingPageTabs(first)).toEqual(tabs.slice(0, 2))
  })

  it.each([undefined, { pages: [] }, new Error('Activity log unavailable')])(
    'reports an unavailable event log instead of falling back to browser history (%s)',
    async result => {
      const sendMessage =
        result instanceof Error ? vi.fn().mockRejectedValue(result) : vi.fn().mockResolvedValue(result)
      const search = vi.fn().mockResolvedValue([history('https://site.example/history-only')])
      vi.stubGlobal('chrome', {
        history: { search },
        runtime: { sendMessage },
      })
      await expect(fetchReturnPages('history')).rejects.toThrow('Activity log unavailable')
      expect(search).not.toHaveBeenCalled()
    },
  )

  it('compacts lifetime visit records to in-window days without changing cross-variant ranking', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const a = 'https://site.example/doc?ref=a'
    const b = 'https://site.example/doc?ref=b'
    const records = new Map([
      [a, visits(...Array(200).fill(ago(0)), ago(1), ago(50), now + 1000)],
      [b, visits(ago(1), ago(2))],
    ])
    const items = [history(a), history(b, 1)]
    vi.stubGlobal('chrome', {
      history: {
        search: vi.fn().mockResolvedValue(items),
        getVisits: vi.fn(async ({ url }: { url: string }) => records.get(url)),
      },
    })
    const fetched = await fetchReturnPages('frequent')
    expect(fetched).toEqual(
      buildReturnPages(items, 'frequent', records, now).map(page => ({ ...page, ranking: 'frequent-history' })),
    )
    expect(fetched[0].activeDays).toBe(3)
    expect(records.get(a)).toHaveLength(203)
  })

  it('bounds frequent-statistics concurrency and stops queued work after cancellation', async () => {
    const controller = new AbortController()
    let active = 0,
      peak = 0,
      calls = 0
    const items = Array.from({ length: 20 }, (_, i) => ({
      ...history(`https://site.example/${i}`),
      lastVisitTime: Date.now() - 1000,
    }))
    vi.stubGlobal('chrome', {
      history: {
        search: vi.fn().mockResolvedValue(items),
        getVisits: vi.fn(async () => {
          calls++
          active++
          peak = Math.max(peak, active)
          await new Promise(resolve => setTimeout(resolve, 1))
          controller.abort()
          active--
          return []
        }),
      },
    })
    await expect(fetchReturnPages('frequent', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(peak).toBeLessThanOrEqual(6)
    expect(calls).toBe(6)
  })

  it('ranks foreground usage first while retaining history-only pages without fabricated usage', async () => {
    const logger = vi.spyOn(console, 'info').mockImplementation(() => {})
    const time = Date.now()
    const snapshot: ActivitySnapshot = {
      now: time,
      bytes: 500,
      activeViewId: null,
      pages: [
        { id: 1, key: 'https://site.example/doc', url: 'https://site.example/doc?full=1', title: 'Repeated document' },
      ],
      events: [
        { id: 1, viewId: 'a', pageId: 1, type: 'enter', at: time - 300_000, source: 'tab' },
        { id: 2, viewId: 'a', pageId: 1, type: 'leave', at: time - 240_000, source: 'window' },
        { id: 3, viewId: 'b', pageId: 1, type: 'enter', at: time - 120_000, source: 'tab' },
        { id: 4, viewId: 'b', pageId: 1, type: 'leave', at: time - 60_000, source: 'window' },
      ],
    }
    const search = vi.fn().mockResolvedValue([{ ...history('https://site.example/new'), lastVisitTime: time }])
    vi.stubGlobal('chrome', { history: { search }, runtime: { sendMessage: vi.fn().mockResolvedValue(snapshot) } })
    const pages = await fetchReturnPages('recent')
    expect(pages).toHaveLength(2)
    expect(pages[0]).toMatchObject({
      title: 'Repeated document',
      url: 'https://site.example/doc?full=1',
      usage: { views: 2 },
    })
    const detail = JSON.parse(logger.mock.calls[0][1])
    expect(detail).toMatchObject({
      stage: 'ranking',
      ranking: 'foreground-usage',
      activityStatus: 'scored-pages-found',
    })
    expect(detail.candidates[0].score).toBe(pages[0].usage!.score)
    expect(pages[1]).toMatchObject({ id: 'https://site.example/new', ranking: 'recent-history' })
    expect(pages[1].usage).toBeUndefined()
    const { days } = detail.activityDiagnostics[0].breakdown
    expect(days.reduce((sum: number, day: { score: number }) => sum + day.score, 0)).toBeCloseTo(
      detail.candidates[0].score,
      12,
    )
    search.mockRejectedValue(new Error('History unavailable'))
    expect(await fetchReturnPages('recent')).toHaveLength(1)
  })

  it('scores all recorded stays and homepages while keeping detailed logs bounded', async () => {
    const logger = vi.spyOn(console, 'info').mockImplementation(() => {})
    const github = 'https://github.com/N0I0C0K'
    const homepage = 'https://www.bilibili.com/'
    const video = 'https://www.bilibili.com/video/example/'
    const snapshot: ActivitySnapshot = {
      now,
      bytes: 33_000,
      activeViewId: null,
      pages: Array.from({ length: 80 }, (_, index) => {
        const url = [github, homepage, video][index] ?? `https://site.example/${index}`
        return { id: index + 1, key: url, url, title: url }
      }),
      events: [],
    }
    const view = (pageId: number, start: number, seconds: number) => {
      const id = snapshot.events.length + 1
      snapshot.events.push(
        { id, viewId: String(id), pageId, type: 'enter', at: start, source: 'tab', reason: 'tab-switch' },
        {
          id: id + 1,
          viewId: String(id),
          pageId,
          type: 'leave',
          at: start + seconds * 1000,
          source: 'tab',
          reason: 'tab-switch',
        },
      )
    }
    // Two brief stays with a ten-second absence both count, without a thirty-second gate.
    view(1, now - 170_000, 20)
    view(1, now - 140_000, 20)
    for (const id of [2, 3]) {
      view(id, now - 1_000_000, 60)
      view(id, now - 500_000, 60)
    }
    for (let id = 4; id <= snapshot.pages.length; id++) view(id, now - 600_000 + id * 1000, 8)
    vi.stubGlobal('chrome', {
      history: { search: vi.fn().mockResolvedValue(snapshot.pages.map(page => history(page.url))) },
      runtime: { sendMessage: vi.fn().mockResolvedValue(snapshot) },
    })
    const pages = await fetchReturnPages('recent')
    expect(filterReturnPages(pages, preferences)).toHaveLength(80)
    expect(pages.map(page => page.id)).toEqual(expect.arrayContaining([github, homepage, video]))
    const log = JSON.parse(logger.mock.calls[0][1])
    expect(log).toMatchObject({ candidateCount: 80, diagnosticCount: 80, ineligiblePageCount: 0 })
    expect(log.loggedDiagnosticCount).toBe(log.activityDiagnostics.length)
    expect(log.loggedDiagnosticCount).toBeLessThanOrEqual(2 * RETURN_PAGE_LOG_LIMIT)
    expect(log.omittedDiagnostics).toBe(80 - log.loggedDiagnosticCount)
    expect(new TextEncoder().encode(logger.mock.calls[0][1]).length).toBeLessThan(15 * 1024)
    expect(log.activityDiagnostics.find((detail: ActivityScoreDiagnostic) => detail.pageKey === github)).toMatchObject({
      eligible: true,
      reason: 'eligible',
      rawSegments: 2,
      mergedViews: 2,
      usage: { views: 2, totalSeconds: 40, tabSwitches: 2 },
      lastEvent: { type: 'leave', source: 'tab', reason: 'tab-switch', at: now - 120_000 },
    })
    expect(log.activityDiagnostics.some((detail: ActivityScoreDiagnostic) => detail.reason !== 'eligible')).toBe(false)
    expect(
      log.activityDiagnostics.find((detail: ActivityScoreDiagnostic) => detail.eligible).breakdown.days[0].date,
    ).toBe('2026-10-01')

    // A later return adds another independent stay.
    view(1, now - 60_000, 60)
    const refreshed = await fetchReturnPages('recent')
    expect(filterReturnPages(refreshed, preferences).map(page => page.id)).toContain(github)
    expect(refreshed.find(page => page.id === github)?.usage?.views).toBe(3)
  })

  it('falls back to history when activity storage is unavailable', async () => {
    vi.stubGlobal('chrome', {
      history: {
        search: vi
          .fn()
          .mockResolvedValue([{ ...history('https://site.example/doc'), lastVisitTime: Date.now() - 1000 }]),
      },
      runtime: { sendMessage: vi.fn().mockRejectedValue(new Error('Database unavailable')) },
    })
    const pages = await fetchReturnPages('recent')
    expect(pages).toEqual([expect.objectContaining({ id: 'https://site.example/doc' })])
    expect(pages[0].usage).toBeUndefined()
  })
})
