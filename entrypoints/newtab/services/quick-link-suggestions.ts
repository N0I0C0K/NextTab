import type { QuickUrlItem } from '@/utils/storage'

function siteKey(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    return ['http:', 'https:'].includes(url.protocol) ? url.host.replace(/^www\./, '') : null
  } catch {
    return null
  }
}

/** Use browser ranking, with one homepage per site and no sites already saved. */
export function selectQuickLinkSuggestions(
  sites: chrome.topSites.MostVisitedURL[],
  saved: QuickUrlItem[],
): chrome.topSites.MostVisitedURL[] {
  const seen = new Set(saved.map(item => siteKey(item.url)).filter(Boolean))
  const suggestions: chrome.topSites.MostVisitedURL[] = []
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
