import { pageIdentity, rankRecentPages, type RecentPage } from '../../recent-page-recommendations'

const DAY = 24 * 60 * 60 * 1000
const CACHE_DURATION = 5 * 60 * 1000
const cachedDomains = new Map<string, { updatedAt: number; promise: Promise<RecentPage[]> }>()

interface DomainPageVisits {
  url: string
  title: string
  visits: number[]
}

function pagePath(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    return ['http:', 'https:'].includes(url.protocol)
      ? `${url.host.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}`
      : null
  } catch {
    return null
  }
}

function matchesDomain(rawUrl: string, domain: string): boolean {
  try {
    const host = new URL(rawUrl).hostname
    return host === domain || host === `www.${domain}` || `www.${host}` === domain
  } catch {
    return false
  }
}

export function rankDomainRecommendations(pages: DomainPageVisits[], now: number): RecentPage[] {
  return rankRecentPages(pages, now).sort((a, b) => {
    const score = (page: RecentPage) => {
      const frequency28 = page.days28 / 28
      const frequency7 = page.days7 / 7
      const recency = Math.exp(-(now - page.lastVisitTime) / (7 * DAY))
      return 0.45 * frequency28 + 0.35 * frequency7 + 0.2 * recency + 0.12 * frequency7 * recency
    }
    return score(b) - score(a) || b.days28 - a.days28 || b.lastVisitTime - a.lastVisitTime
  })
}

export function selectDomainRecommendations(pages: RecentPage[], excludedUrls: string[], limit = 2): RecentPage[] {
  if (limit <= 0) return []
  const seen = new Set(excludedUrls.map(pagePath).filter((path): path is string => path !== null))
  const selected: RecentPage[] = []
  for (const page of pages) {
    const path = pagePath(page.url)
    if (path === null || pageIdentity(page.url) === null || seen.has(path)) continue
    selected.push(page)
    seen.add(path)
    if (selected.length === limit) break
  }
  return selected
}

async function collectDomainRecommendations(domain: string, now: number): Promise<RecentPage[]> {
  const history = await chrome.history.search({ text: domain, startTime: now - 28 * DAY, maxResults: 200 })
  const eligible = history.filter(
    item => item.url && item.title && matchesDomain(item.url, domain) && pageIdentity(item.url),
  )
  const byFrequency = [...eligible].sort(
    (a, b) => (b.visitCount ?? 0) - (a.visitCount ?? 0) || (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0),
  )
  const candidates = [
    ...new Map([...byFrequency.slice(0, 40), ...eligible.slice(0, 20)].map(item => [item.url, item])).values(),
  ]
  const pages: DomainPageVisits[] = []

  for (let index = 0; index < candidates.length; index += 10) {
    const batch = candidates.slice(index, index + 10)
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
  return rankDomainRecommendations(pages, now)
}

export function getDomainRecommendations(domain: string): Promise<RecentPage[]> {
  const cached = cachedDomains.get(domain)
  if (cached && Date.now() - cached.updatedAt < CACHE_DURATION) return cached.promise

  const promise = collectDomainRecommendations(domain, Date.now())
  cachedDomains.set(domain, { updatedAt: Date.now(), promise })
  void promise.catch(() => {
    if (cachedDomains.get(domain)?.promise === promise) cachedDomains.delete(domain)
  })
  return promise
}
