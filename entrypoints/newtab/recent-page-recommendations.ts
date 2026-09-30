export interface RecentPage {
  url: string
  title: string
  host: string
  days28: number
  days7: number
  lastVisitTime: number
}

interface PageVisits {
  url: string
  title: string
  visits: number[]
}

const DAY = 24 * 60 * 60 * 1000
const BLOCKED_PATH =
  /(?:^|\/)(?:login|log-in|signin|sign-in|signup|sign-up|logout|signout|callback|oauth|authorize|auth|sso|search)(?:\/|$)/i
const BLOCKED_HOST = /^(?:accounts|auth|login|sso|signin|passport)\./i

export function pageIdentity(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return null
    if (url.search || url.hash || url.pathname === '/' || BLOCKED_HOST.test(url.hostname)) return null
    if (BLOCKED_PATH.test(url.pathname)) return null
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return null
  }
}

function localDay(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function rankRecentPages(pages: PageVisits[], now: number): RecentPage[] {
  const since28 = now - 28 * DAY
  const since7 = now - 7 * DAY
  const unique = new Map<string, RecentPage>()

  for (const page of pages) {
    const identity = pageIdentity(page.url)
    const title = page.title.trim()
    if (!identity || !title || title.length < 3) continue
    const visitTimes = page.visits.filter(time => time >= since28 && time <= now)
    const days28 = new Set(visitTimes.map(localDay)).size
    if (days28 < 2) continue
    const days7 = new Set(visitTimes.filter(time => time >= since7).map(localDay)).size
    const lastVisitTime = Math.max(...visitTimes)
    const host = new URL(identity).hostname.replace(/^www\./, '')
    const existing = unique.get(identity)
    if (
      !existing ||
      days28 > existing.days28 ||
      (days28 === existing.days28 && lastVisitTime > existing.lastVisitTime)
    ) {
      unique.set(identity, { url: page.url, title, host, days28, days7, lastVisitTime })
    }
  }

  return [...unique.values()].sort(
    (a, b) => b.days28 - a.days28 || b.days7 - a.days7 || b.lastVisitTime - a.lastVisitTime,
  )
}

export function selectRecentPages(
  pages: RecentPage[],
  quickLinkUrls: string[],
  limit = 6,
  maxPerHost = 2,
): RecentPage[] {
  const quickLinks = new Set(quickLinkUrls.map(pageIdentity).filter((url): url is string => url !== null))
  const perHost = new Map<string, number>()
  const selected: RecentPage[] = []
  for (const page of pages) {
    const identity = pageIdentity(page.url)
    if (!identity || quickLinks.has(identity) || (perHost.get(page.host) ?? 0) >= maxPerHost) continue
    selected.push(page)
    perHost.set(page.host, (perHost.get(page.host) ?? 0) + 1)
    if (selected.length === limit) break
  }
  return selected
}

export async function collectRecentPages(now = Date.now()): Promise<RecentPage[]> {
  const history = await chrome.history.search({ text: '', startTime: now - 28 * DAY, maxResults: 3000 })
  const eligible = history.filter(item => item.url && item.title && pageIdentity(item.url))
  const byFrequency = [...eligible].sort(
    (a, b) => (b.visitCount ?? 0) - (a.visitCount ?? 0) || (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0),
  )
  const candidates = [
    ...new Map([...byFrequency.slice(0, 180), ...eligible.slice(0, 40)].map(item => [item.url, item])).values(),
  ]
  const pages: PageVisits[] = []

  // Bound the number of simultaneous history lookups; this runs only when the local cache is stale.
  for (let index = 0; index < candidates.length; index += 12) {
    const batch = candidates.slice(index, index + 12)
    const results = await Promise.allSettled(batch.map(item => chrome.history.getVisits({ url: item.url! })))
    results.forEach((result, offset) => {
      if (result.status === 'fulfilled') {
        pages.push({
          url: batch[offset].url!,
          title: batch[offset].title!,
          visits: result.value.map(visit => visit.visitTime ?? 0),
        })
      }
    })
  }
  return rankRecentPages(pages, now).slice(0, 30)
}
