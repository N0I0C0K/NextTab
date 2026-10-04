import type { ReturnPagePreferences, ReturnPageSource } from '@/utils/storage'
import {
  ACTIVITY_SNAPSHOT_MESSAGE,
  ACTIVITY_WINDOW_MS,
  DAY_MS,
  activityDate as visitDate,
  isReturnablePage,
  normalizePageUrl,
  type ActivitySnapshot,
} from '@/utils/page-activity/model'
import {
  ACTIVITY_SCORING,
  scoreActivity,
  type ActivityScoreDiagnostic,
  type PageUsage,
} from '@/utils/page-activity/scoring'

export { isReturnablePage, normalizePageUrl } from '@/utils/page-activity/model'

export type { ReturnPageSource } from '@/utils/storage'
export type ReturnPageRanking = 'foreground-usage' | 'recent-history' | 'frequent-history' | 'open-tab' | 'event-log'
export const RETURN_PAGE_LOG_LIMIT = 5
export const OPEN_TAB_MULTIPLIER = 1.3
export type ReturnPage = {
  id: string
  url: string
  title: string
  lastVisitTime: number
  activeDays: number
  usage?: PageUsage
  ranking?: ReturnPageRanking
  openTabMultiplier?: number
  rankingScore?: number
}

/** Parse each tab URL once, so page lists can reuse matches instead of scanning all tabs per row. */
export function groupPageTabs(tabs: chrome.tabs.Tab[], exactUrl = false): Map<string, chrome.tabs.Tab[]> {
  const groups = new Map<string, chrome.tabs.Tab[]>()
  for (const tab of tabs) {
    const url = tab.url ?? tab.pendingUrl ?? ''
    const key = exactUrl ? url : normalizePageUrl(url)
    if (!key) continue
    const group = groups.get(key)
    if (group) group.push(tab)
    else groups.set(key, [tab])
  }
  return groups
}

/** Apply the current tab state once per canonical page, outside historical daily decay. */
export function rankRecentPages(pages: ReturnPage[], tabs: chrome.tabs.Tab[]): ReturnPage[] {
  const candidates = new Map(pages.map(page => [page.id, page]))
  const opened = groupPageTabs(tabs)
  for (const [key, [tab]] of opened) {
    const url = tab.url ?? tab.pendingUrl ?? ''
    if (!candidates.has(key)) {
      const parsed = new URL(key)
      candidates.set(key, {
        id: key,
        url,
        title: tab.title?.trim() || `${parsed.hostname}${parsed.pathname}`,
        lastVisitTime: 0,
        activeDays: 0,
        ranking: 'open-tab',
      })
    }
  }
  return [...candidates.values()]
    .map(page => {
      const openTabMultiplier = opened.has(page.id) ? OPEN_TAB_MULTIPLIER : 1
      return { ...page, openTabMultiplier, rankingScore: (page.usage?.score ?? 0) * openTabMultiplier }
    })
    .sort((a, b) => b.rankingScore - a.rankingScore || b.lastVisitTime - a.lastVisitTime || a.id.localeCompare(b.id))
}

export function getHistoryWindowStart(days: number, now = Date.now()): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - days + 1)
  return start.getTime()
}

export function buildReturnPages(
  history: chrome.history.HistoryItem[],
  source: Exclude<ReturnPageSource, 'history'>,
  visitsByUrl: Map<string, chrome.history.VisitItem[]> = new Map(),
  now = Date.now(),
  windowDays = source === 'recent' ? 7 : 30,
): ReturnPage[] {
  const start = source === 'recent' ? now - windowDays * DAY_MS : getHistoryWindowStart(windowDays, now)
  const pages = new Map<string, ReturnPage>()
  const daysByPage = new Map<string, Set<string>>()

  for (const item of history) {
    if (!item.url || !isReturnablePage(item.url)) continue
    const url = normalizePageUrl(item.url)!
    const lastVisitTime = item.lastVisitTime ?? 0
    if (!Number.isFinite(lastVisitTime) || lastVisitTime <= 0 || lastVisitTime < start || lastVisitTime > now) continue
    const existing = pages.get(url)
    if (!existing || lastVisitTime > existing.lastVisitTime) {
      pages.set(url, {
        id: url,
        url: item.url,
        title: item.title?.trim() || `${new URL(url).hostname}${new URL(url).pathname}`,
        lastVisitTime,
        activeDays: 0,
      })
    }
    if (source === 'frequent') {
      const days = daysByPage.get(url) ?? new Set<string>()
      for (const visit of visitsByUrl.get(item.url) ?? []) {
        if (visit.visitTime !== undefined && visit.visitTime >= start && visit.visitTime <= now) {
          days.add(visitDate(visit.visitTime))
        }
      }
      daysByPage.set(url, days)
    }
  }

  return [...pages.entries()]
    .map(([url, page]) => ({ ...page, activeDays: daysByPage.get(url)?.size ?? 0 }))
    .sort((a, b) =>
      source === 'frequent'
        ? b.activeDays - a.activeDays || b.lastVisitTime - a.lastVisitTime || a.id.localeCompare(b.id)
        : b.lastVisitTime - a.lastVisitTime || a.id.localeCompare(b.id),
    )
}

/** Read the latest enter for each logged page without usage scoring or recommendation filters. */
export function buildVisitedPages(snapshot: ActivitySnapshot): ReturnPage[] {
  const latest = new Map<number, number>()
  for (const event of snapshot.events) {
    if (event.type === 'enter' && event.at > (latest.get(event.pageId) ?? -Infinity)) latest.set(event.pageId, event.at)
  }
  return snapshot.pages
    .flatMap(page => {
      const at = latest.get(page.id)
      return at === undefined
        ? []
        : [
            {
              id: page.key,
              url: page.url,
              title: page.title.trim() || page.url,
              lastVisitTime: at,
              activeDays: 0,
              ranking: 'event-log' as const,
            },
          ]
    })
    .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
}

function returnPageExclusion(preferences: ReturnPagePreferences) {
  const hidden = new Set(preferences.hiddenUrls.map(normalizePageUrl))
  const excluded = new Set(preferences.excludedHosts)
  return (page: ReturnPage) => {
    const normalized = normalizePageUrl(page.url)
    if (!normalized) return 'invalid-url'
    const url = new URL(normalized)
    if (hidden.has(normalized)) return 'hidden-page'
    if (excluded.has(url.hostname)) return 'excluded-site'
    return null
  }
}

export function filterReturnPages(
  pages: ReturnPage[],
  preferences: ReturnPagePreferences,
  source: ReturnPageSource = 'recent',
): ReturnPage[] {
  if (source === 'history') return pages
  const exclusion = returnPageExclusion(preferences)
  return pages.filter(page => !exclusion(page))
}

/** Log after UI filters as well, so candidate scores can be matched to the visible homepage. */
export function logReturnPageDisplay(
  source: ReturnPageSource,
  snapshot: ReturnPage[],
  preferences: ReturnPagePreferences,
  visibleCount: number,
) {
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') return
  const exclusion = returnPageExclusion(preferences)
  let rank = 0
  const entries = snapshot.map(page => {
    const reason = source === 'history' ? null : exclusion(page)
    const displayRank = reason ? null : ++rank
    return {
      pageKey: page.id,
      title: page.title.slice(0, 160),
      usageScore: page.usage?.score ?? null,
      openTabMultiplier: page.openTabMultiplier,
      score: page.rankingScore ?? page.usage?.score ?? null,
      displayRank,
      shownOnHome: displayRank !== null && displayRank <= visibleCount,
      reason: reason ?? (displayRank! <= visibleCount ? 'shown-on-home' : 'view-all-only'),
    }
  })
  const included = entries.filter(page => page.displayRank !== null)
  const excluded = entries.filter(page => page.displayRank === null)
  console.info(
    '[NextTab:return-pages]',
    JSON.stringify(
      {
        stage: 'display',
        source,
        visibleCount,
        total: snapshot.length,
        includedCount: included.length,
        excludedCount: excluded.length,
        omittedPages: Math.max(0, included.length - RETURN_PAGE_LOG_LIMIT),
        pages: included.slice(0, RETURN_PAGE_LOG_LIMIT),
        excludedSample: excluded.slice(0, RETURN_PAGE_LOG_LIMIT),
      },
      null,
      2,
    ),
  )
}

export async function fetchReturnPages(source: ReturnPageSource, signal?: AbortSignal): Promise<ReturnPage[]> {
  if (source === 'history') {
    const snapshot: ActivitySnapshot = await chrome.runtime.sendMessage({
      type: ACTIVITY_SNAPSHOT_MESSAGE,
      incognito: chrome.extension?.inIncognitoContext,
    })
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (!Array.isArray(snapshot?.pages) || !Array.isArray(snapshot?.events)) throw new Error('Activity log unavailable')
    const pages = buildVisitedPages(snapshot)
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      console.info(
        '[NextTab:return-pages]',
        JSON.stringify({
          stage: 'ranking',
          source,
          ranking: 'event-log',
          explanation: '按 event log 中每个页面最近一次 enter 的时间倒序，不使用评分或推荐过滤。',
          evaluatedAt: snapshot.now,
          candidateCount: pages.length,
          candidates: pages
            .slice(0, RETURN_PAGE_LOG_LIMIT)
            .map(page => ({ pageKey: page.id, url: page.url, lastVisitTime: page.lastVisitTime })),
        }),
      )
    }
    return pages
  }
  const now = Date.now()
  const [historyResult, activityResult, tabsResult] = await Promise.allSettled([
    chrome.history.search({
      text: '',
      startTime: source === 'recent' ? now - ACTIVITY_WINDOW_MS : getHistoryWindowStart(30, now),
      maxResults: 1000,
    }),
    source === 'recent'
      ? chrome.runtime?.sendMessage({
          type: ACTIVITY_SNAPSHOT_MESSAGE,
          incognito: chrome.extension?.inIncognitoContext,
        })
      : Promise.resolve(null),
    source === 'recent' ? queryProfileTabs() : Promise.resolve([]),
  ])
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const activity = activityResult.status === 'fulfilled' ? (activityResult.value as ActivitySnapshot | null) : null
  const tabs = tabsResult.status === 'fulfilled' ? tabsResult.value : []
  const scored = activity?.events && activity.pages && Number.isFinite(activity.now) ? scoreActivity(activity) : []
  const history = historyResult.status === 'fulfilled' ? historyResult.value : []
  const visits = new Map<string, chrome.history.VisitItem[]>()
  if (source === 'frequent') {
    const urls = [...new Set(history.flatMap(item => (item.url && isReturnablePage(item.url) ? [item.url] : [])))]
    const start = getHistoryWindowStart(30, now)
    let index = 0
    let failed = false
    // Bound work on the lazy frequent tab; never make one thousand concurrent API calls.
    await Promise.all(
      Array.from({ length: Math.min(6, urls.length) }, async () => {
        while (index < urls.length && !signal?.aborted && !failed) {
          const url = urls[index++]
          try {
            // Only one visit per local day is needed for ranking. Release lifetime
            // records immediately rather than retaining them for all 1,000 URLs.
            const days = new Map<string, chrome.history.VisitItem>()
            for (const visit of await chrome.history.getVisits({ url })) {
              if (visit.visitTime !== undefined && visit.visitTime >= start && visit.visitTime <= now)
                days.set(visitDate(visit.visitTime), visit)
            }
            visits.set(url, [...days.values()])
          } catch (error) {
            failed = true
            throw error
          }
        }
      }),
    )
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const scoredKeys = new Set(scored.map(page => page.id))
  // History-only pages have no usage score yet. Keep them after scored pages, in their history order.
  const combined: ReturnPage[] = [
    ...scored.map(page => ({ ...page, ranking: 'foreground-usage' as const })),
    ...buildReturnPages(history, source, visits, now)
      .filter(page => !scoredKeys.has(page.id))
      .map(page => ({
        ...page,
        ranking: source === 'frequent' ? ('frequent-history' as const) : ('recent-history' as const),
      })),
  ]
  const pages = source === 'recent' ? rankRecentPages(combined, tabs) : combined
  // Open tabs alone cannot replace the missing history list on a failed refresh.
  if (historyResult.status === 'rejected' && !scored.length) throw historyResult.reason
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    const sample = pages.slice(0, RETURN_PAGE_LOG_LIMIT)
    const sampleKeys = new Set(sample.map(page => page.id))
    const diagnostics: ActivityScoreDiagnostic[] = []
    const lastEvents = new Map<number, ActivitySnapshot['events'][number]>()
    let diagnosticPages: ActivitySnapshot['pages'] = []
    if (activity?.events && activity.pages && Number.isFinite(activity.now)) {
      for (const event of activity.events) {
        if (!Number.isFinite(event.at) || event.at > activity.now) continue
        if (event.at >= (lastEvents.get(event.pageId)?.at ?? -Infinity)) lastEvents.set(event.pageId, event)
      }
      const eligibleKeys = new Set(scored.map(page => page.id))
      // Show a bounded sample of recent misses as well as leading candidates.
      // Candidate-only diagnostics cannot explain why a repeatedly viewed page disappeared.
      const misses = activity.pages
        .filter(page => !eligibleKeys.has(page.key))
        .sort((a, b) => (lastEvents.get(b.id)?.at ?? 0) - (lastEvents.get(a.id)?.at ?? 0))
        .slice(0, RETURN_PAGE_LOG_LIMIT)
      for (const page of misses) sampleKeys.add(page.key)
      diagnosticPages = activity.pages.filter(page => sampleKeys.has(page.key))
      scoreActivity({ ...activity, pages: diagnosticPages }, diagnostic => diagnostics.push(diagnostic))
    }
    console.info(
      '[NextTab:return-pages]',
      JSON.stringify(
        {
          stage: 'ranking',
          source,
          ranking: scored.length
            ? 'foreground-usage'
            : pages.some(page => (page.openTabMultiplier ?? 1) > 1)
              ? 'open-tabs'
              : 'browser-history',
          explanation:
            source === 'recent'
              ? '按每天的对数使用得分分别衰减后求和，仍有打开标签的页面乘 1.3，再按最终得分排序。无前台记录的基础分为 0，乘后仍为 0，同路径多个标签只乘一次。'
              : '按最近 30 个自然日的访问天数降序，再按最近访问时间和页面地址排序，没有使用评分。',
          openTabsStatus:
            source !== 'recent' ? 'not-requested' : tabsResult.status === 'fulfilled' ? 'available' : 'unavailable',
          activityStatus:
            source !== 'recent'
              ? 'not-requested'
              : activityResult.status === 'rejected'
                ? 'unavailable'
                : !activity?.events || !activity.pages || !Number.isFinite(activity.now)
                  ? 'missing-snapshot'
                  : scored.length
                    ? 'scored-pages-found'
                    : 'no-recorded-views',
          evaluatedAt: activity?.now ?? now,
          activityBytes: activity?.bytes,
          activityEventCount: activity?.events?.length,
          activeViewId: activity?.activeViewId,
          total: history.length,
          candidateCount: pages.length,
          omittedCandidates: Math.max(0, pages.length - RETURN_PAGE_LOG_LIMIT),
          logLimit: RETURN_PAGE_LOG_LIMIT,
          scoringParameters:
            source === 'recent' ? { ...ACTIVITY_SCORING, openTabMultiplier: OPEN_TAB_MULTIPLIER } : undefined,
          formula:
            source === 'recent'
              ? {
                  views: '25 × ln(1 + 当天进入次数) / ln(5)',
                  median: '20 × ln(1 + 当天单次停留中位数 / 60 秒) / ln(11)',
                  total: '25 × ln(1 + 当天累计停留 / 600 秒) / ln(7)',
                  days: '当天有停留记录贡献 15 分',
                  final:
                    '每日四项之和 × 2^(-距该日结束的小时数 / 72)，再对近 7 天求和，仍打开标签时乘 1.3；当天权重为 1。',
                  openTab:
                    '当前 Profile 的任一窗口仍有同站点和路径的标签，使用分即乘 1.3；系数放在每日衰减之外，同页面多个标签不叠乘。',
                  recording: '每次进入独立计数，不设次数、时长门槛或上限；仅重叠区间去重，跨午夜停留按天拆分。',
                }
              : undefined,
          // Original and canonical URLs make duplicate reports reproducible.
          history: history
            .filter(item => item.url && sampleKeys.has(normalizePageUrl(item.url)!))
            .slice(0, RETURN_PAGE_LOG_LIMIT)
            .map(item => ({
              title: item.title?.slice(0, 160),
              url: item.url,
              pageKey: item.url ? normalizePageUrl(item.url) : null,
            })),
          candidates: sample.map((page, index) => ({
            rank: index + 1,
            title: page.title.slice(0, 160),
            url: page.url,
            pageKey: page.id,
            usageScore: page.usage?.score ?? null,
            openTabMultiplier: page.openTabMultiplier,
            score: page.rankingScore ?? page.usage?.score ?? null,
            ranking: page.ranking,
            lastVisitTime: page.lastVisitTime,
            activeDays: page.activeDays,
            usage: page.usage,
          })),
          diagnosticCount: source === 'recent' ? (activity?.pages?.length ?? 0) : undefined,
          ineligiblePageCount: source === 'recent' ? (activity?.pages?.length ?? 0) - scored.length : undefined,
          loggedDiagnosticCount: source === 'recent' ? diagnostics.length : undefined,
          omittedDiagnostics:
            source === 'recent' ? Math.max(0, (activity?.pages?.length ?? 0) - diagnostics.length) : undefined,
          activityDiagnostics:
            source === 'recent'
              ? diagnostics.map(diagnostic => {
                  const page = diagnosticPages.find(page => page.key === diagnostic.pageKey)!
                  const event = lastEvents.get(page.id)
                  return {
                    pageKey: diagnostic.pageKey,
                    title: diagnostic.eligible ? undefined : page.title.slice(0, 160),
                    eligible: diagnostic.eligible,
                    reason: diagnostic.reason,
                    rawSegments: diagnostic.rawSegments,
                    mergedViews: diagnostic.mergedViews,
                    observed: diagnostic.eligible ? undefined : diagnostic.observed,
                    lastEvent: event && { at: event.at, type: event.type, source: event.source, reason: event.reason },
                    usage: diagnostic.usage,
                    breakdown: diagnostic.breakdown,
                  }
                })
              : undefined,
        },
        null,
        2,
      ),
    )
  }
  return pages
}

export async function queryProfileTabs(): Promise<chrome.tabs.Tab[]> {
  const [tabs, current] = await Promise.all([chrome.tabs.query({}), chrome.tabs.getCurrent()])
  const incognito = current?.incognito ?? chrome.extension?.inIncognitoContext ?? false
  return tabs.filter(tab => Boolean(tab.incognito) === incognito)
}

export async function matchingPageTabs(url: string, exactUrl = false): Promise<chrome.tabs.Tab[]> {
  const tabs = await queryProfileTabs()
  if (exactUrl) return tabs.filter(tab => (tab.url ?? tab.pendingUrl) === url)
  const normalized = normalizePageUrl(url)
  if (!normalized) return []
  return tabs.filter(tab => normalizePageUrl(tab.url ?? tab.pendingUrl ?? '') === normalized)
}

export async function switchToPageTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) return
  await chrome.tabs.update(tab.id, { active: true })
  await chrome.windows.update(tab.windowId, { focused: true })
}
