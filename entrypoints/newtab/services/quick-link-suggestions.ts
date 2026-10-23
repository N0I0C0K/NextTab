import type { QuickUrlItem } from '@/utils/storage'
import { ACTIVITY_SNAPSHOT_MESSAGE, type ActivitySnapshot } from '@/utils/page-activity/model'
import { scoreActivity } from '@/utils/page-activity/scoring'

export type QuickLinkSuggestion = { title: string; url: string }

/** Rank sites by the sum of their pages' foreground usage, using the existing seven-day scoring. */
export async function fetchQuickLinkSuggestions(): Promise<QuickLinkSuggestion[]> {
  const snapshot: ActivitySnapshot = await chrome.runtime.sendMessage({
    type: ACTIVITY_SNAPSHOT_MESSAGE,
    incognito: chrome.extension?.inIncognitoContext,
  })
  if (!Array.isArray(snapshot?.pages) || !Array.isArray(snapshot?.events) || !Number.isFinite(snapshot.now)) {
    throw new Error('Activity log unavailable')
  }
  return buildQuickLinkSuggestions(snapshot)
}

export function buildQuickLinkSuggestions(snapshot: ActivitySnapshot): QuickLinkSuggestion[] {
  const sites = new Map<string, QuickLinkSuggestion & { score: number; lastUsedAt: number }>()
  const pages = scoreActivity(snapshot).sort(
    (a, b) => b.usage.score - a.usage.score || b.lastVisitTime - a.lastVisitTime || a.id.localeCompare(b.id),
  )
  for (const page of pages) {
    const key = siteKey(page.url)!
    const site = sites.get(key)
    if (site) {
      site.score += page.usage.score
      site.lastUsedAt = Math.max(site.lastUsedAt, page.lastVisitTime)
    } else {
      sites.set(key, {
        title: page.title.trim() || key,
        url: `${new URL(page.url).origin}/`,
        score: page.usage.score,
        lastUsedAt: page.lastVisitTime,
      })
    }
  }
  return [...sites.values()]
    .sort((a, b) => b.score - a.score || b.lastUsedAt - a.lastUsedAt || a.url.localeCompare(b.url))
    .map(({ title, url }) => ({ title, url }))
}

function siteKey(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    return ['http:', 'https:'].includes(url.protocol) ? url.host.replace(/^www\./, '') : null
  } catch {
    return null
  }
}

/** Keep event ranking, with one homepage per site and no sites already saved. */
export function selectQuickLinkSuggestions(sites: QuickLinkSuggestion[], saved: QuickUrlItem[]): QuickLinkSuggestion[] {
  const seen = new Set(saved.map(item => siteKey(item.url)).filter(Boolean))
  const suggestions: QuickLinkSuggestion[] = []
  for (const site of sites) {
    const key = siteKey(site.url)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const url = new URL(site.url)
    suggestions.push({ url: `${url.origin}/`, title: site.title.trim() || key })
    if (suggestions.length === 4) break
  }
  return suggestions
}
