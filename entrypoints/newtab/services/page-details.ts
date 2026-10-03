import { ACTIVITY_SNAPSHOT_MESSAGE, ACTIVITY_WINDOW_MS, type ActivitySnapshot } from '@/utils/page-activity/model'
import { scoreActivity, type PageActivitySummary } from '@/utils/page-activity/scoring'
import { getHistoryWindowStart, normalizePageUrl, type ReturnPage } from './return-pages'

export type PageDetails = {
  evaluatedAt: number
  historyDays: number
  history: { visits: number; lastVisitTime: number; limited: boolean } | null
  activity: PageActivitySummary | null
  activityUnavailable: boolean
}

async function pageHistory(page: ReturnPage, days: number, now: number, signal: AbortSignal) {
  const key = normalizePageUrl(page.url)
  const start = days === 7 ? now - ACTIVITY_WINDOW_MS : getHistoryWindowStart(days, now)
  const history = await chrome.history.search({ text: new URL(page.url).hostname, startTime: start, maxResults: 1000 })
  const urls = [
    ...new Set([
      page.url,
      ...history.flatMap(item => (item.url && normalizePageUrl(item.url) === key ? [item.url] : [])),
    ]),
  ]
  const visits = new Map<string, chrome.history.VisitItem>()
  let index = 0
  await Promise.all(
    Array.from({ length: Math.min(6, urls.length) }, async () => {
      while (index < urls.length && !signal.aborted) {
        const records = await chrome.history.getVisits({ url: urls[index++] })
        for (const visit of records) {
          if (visit.visitTime !== undefined && visit.visitTime >= start && visit.visitTime <= now)
            visits.set(visit.visitId, visit)
        }
      }
    }),
  )
  const times = [...visits.values()].map(visit => visit.visitTime!)
  return {
    visits: visits.size,
    lastVisitTime: times.length ? Math.max(...times) : 0,
    limited: history.length === 1000,
  }
}

async function pageActivity(page: ReturnPage, now: number): Promise<PageDetails['activity']> {
  const snapshot: ActivitySnapshot | undefined = await chrome.runtime.sendMessage({
    type: ACTIVITY_SNAPSHOT_MESSAGE,
    incognito: chrome.extension?.inIncognitoContext,
  })
  if (!snapshot?.events || !snapshot.pages || !Number.isFinite(snapshot.now)) throw new Error('Activity unavailable')
  let summary: PageDetails['activity'] = null
  scoreActivity(
    {
      ...snapshot,
      now,
      pages: snapshot.pages.filter(value => value.key === normalizePageUrl(page.url)),
      // The snapshot request can finish after this detail query started. Clip only to this query's time.
      events: snapshot.events.map(event => (event.type === 'leave' && event.at > now ? { ...event, at: now } : event)),
    },
    detail => {
      summary = detail.observed
    },
  )
  return summary
}

/** Read additional information only when requested; never slow down homepage recommendations. */
export async function fetchPageDetails(page: ReturnPage, frequent: boolean, signal: AbortSignal): Promise<PageDetails> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  // A row can remain on screen across many revisits. Details always read fresh records.
  const evaluatedAt = Date.now()
  const historyDays = frequent || page.ranking === 'frequent-history' ? 30 : 7
  const [history, activity] = await Promise.allSettled([
    pageHistory(page, historyDays, evaluatedAt, signal),
    pageActivity(page, evaluatedAt),
  ])
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  return {
    evaluatedAt,
    historyDays,
    history: history.status === 'fulfilled' ? history.value : null,
    activity: activity.status === 'fulfilled' ? activity.value : null,
    activityUnavailable: activity.status === 'rejected',
  }
}
