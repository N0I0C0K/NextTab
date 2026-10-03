import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACTIVITY_WINDOW_MS, type ActivitySnapshot } from '@/utils/page-activity/model'
import { scoreActivity } from '@/utils/page-activity/scoring'
import type { ReturnPage } from './return-pages'
import { fetchPageDetails } from './page-details'

const now = new Date(2026, 9, 2, 12).getTime()
const page: ReturnPage = {
  id: 'https://site.example/doc',
  url: 'https://site.example/doc?ref=a',
  title: 'Document',
  lastVisitTime: now - 60_000,
  activeDays: 0,
  ranking: 'recent-history',
}
const snapshot = (seconds = 60): ActivitySnapshot => ({
  now: now + 60_000,
  bytes: 0,
  activeViewId: null,
  pages: [{ id: 1, key: page.id, url: page.url, title: page.title }],
  events: [
    { id: 1, viewId: 'a', pageId: 1, type: 'enter', source: 'tab', at: now - 120_000 },
    { id: 2, viewId: 'a', pageId: 1, type: 'leave', source: 'window', at: now - 120_000 + seconds * 1000 },
  ],
})
const visits = (id: string, visitTime: number): chrome.history.VisitItem => ({
  id,
  visitId: id,
  visitTime,
  referringVisitId: '0',
  transition: 'link',
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('page detail statistics', () => {
  it('combines query variants, deduplicates visits and reports raw usage without a score module', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const getVisits = vi.fn(async ({ url }: { url: string }) =>
      url.endsWith('ref=b')
        ? [visits('duplicate', now - 60_000), visits('b', now - 180_000)]
        : [
            visits('duplicate', now - 60_000),
            visits('future', now + 1000),
            visits('old', now - ACTIVITY_WINDOW_MS - 86_400_000),
          ],
    )
    vi.stubGlobal('chrome', {
      history: {
        search: vi.fn().mockResolvedValue([{ url: `${page.id}?ref=b` }, { url: 'https://site.example/other' }]),
        getVisits,
      },
      runtime: { sendMessage: vi.fn().mockResolvedValue(snapshot()) },
    })
    const details = await fetchPageDetails(page, false, new AbortController().signal)
    expect(details).toMatchObject({
      evaluatedAt: now,
      history: { visits: 2 },
      activity: { views: 1, totalSeconds: 60, medianSeconds: 60 },
    })
    expect(getVisits).toHaveBeenCalledTimes(2)
    expect(details.activity).not.toHaveProperty('score')
  })

  it('reads current short views instead of the cached ranking snapshot, even if history fails', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const data = snapshot()
    data.events.push(
      { id: 3, viewId: 'b', pageId: 1, type: 'enter', source: 'tab', at: now - 600_000 },
      { id: 4, viewId: 'b', pageId: 1, type: 'leave', source: 'window', at: now - 540_000 },
    )
    const usage = scoreActivity({ ...data, now })[0].usage
    data.events.push(
      { id: 5, viewId: 'short', pageId: 1, type: 'enter', source: 'tab', at: now - 15_000 },
      { id: 6, viewId: 'short', pageId: 1, type: 'leave', source: 'window', at: now - 5000 },
    )
    const sendMessage = vi.fn().mockResolvedValue(data)
    vi.stubGlobal('chrome', {
      history: { search: vi.fn().mockRejectedValue(new Error('Unavailable')) },
      runtime: { sendMessage },
    })
    const details = await fetchPageDetails(
      { ...page, usage, ranking: 'foreground-usage' },
      false,
      new AbortController().signal,
    )
    expect(details.history).toBeNull()
    expect(details.activity).toMatchObject({ views: 3, totalSeconds: 130, lastUsedAt: now - 5000 })
    expect(details.activityUnavailable).toBe(false)
    expect(sendMessage).toHaveBeenCalledOnce()
  })

  it('clips a view left after the snapshot and excludes visits after that time', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const search = vi.fn().mockResolvedValue([])
    vi.stubGlobal('chrome', {
      history: {
        search,
        getVisits: vi.fn().mockResolvedValue([visits('a', now - 1000), visits('future', now + 1000)]),
      },
      runtime: { sendMessage: vi.fn().mockResolvedValue(snapshot(180)) },
    })
    const details = await fetchPageDetails(page, true, new AbortController().signal)
    expect(details).toMatchObject({
      historyDays: 30,
      history: { visits: 1 },
      activity: { views: 1, totalSeconds: 120, lastUsedAt: now },
    })
    expect(search.mock.calls[0][0].startTime).toBeLessThan(now - ACTIVITY_WINDOW_MS)
  })

  it('shows and scores brief returns made after the homepage snapshot', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now + 60_000)
    const data = snapshot()
    data.events = [
      { id: 1, viewId: 'new', pageId: 1, type: 'enter', source: 'tab', at: now + 10_000 },
      { id: 2, viewId: 'new', pageId: 1, type: 'leave', source: 'window', at: now + 15_000 },
      { id: 3, viewId: 'again', pageId: 1, type: 'enter', source: 'tab', at: now + 50_000 },
      { id: 4, viewId: 'again', pageId: 1, type: 'leave', source: 'window', at: now + 55_000 },
    ]
    vi.stubGlobal('chrome', {
      history: {
        search: vi.fn().mockResolvedValue([]),
        getVisits: vi.fn().mockResolvedValue([visits('new', now + 15_000)]),
      },
      runtime: { sendMessage: vi.fn().mockResolvedValue(data) },
    })
    expect(await fetchPageDetails(page, false, new AbortController().signal)).toMatchObject({
      evaluatedAt: now + 60_000,
      activity: {
        views: 2,
        tabSwitches: 2,
        totalSeconds: 10,
        medianSeconds: 5,
        activeDays: 1,
        lastUsedAt: now + 55_000,
      },
      history: { visits: 1, lastVisitTime: now + 15_000 },
    })
    expect(scoreActivity(data)).toHaveLength(1)
  })

  it('distinguishes missing foreground records from a failed read, and cancels stale results', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ...snapshot(), pages: [], events: [] })
    vi.stubGlobal('chrome', {
      history: { search: vi.fn().mockResolvedValue([]), getVisits: vi.fn().mockResolvedValue([]) },
      runtime: { sendMessage },
    })
    expect(await fetchPageDetails(page, false, new AbortController().signal)).toMatchObject({
      activity: null,
      activityUnavailable: false,
      history: { visits: 0 },
    })
    sendMessage.mockRejectedValue(new Error('Unavailable'))
    expect(await fetchPageDetails(page, false, new AbortController().signal)).toMatchObject({
      activity: null,
      activityUnavailable: true,
    })
    const controller = new AbortController()
    controller.abort()
    await expect(fetchPageDetails(page, false, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
