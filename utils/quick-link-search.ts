import type { QuickUrlItem } from './storage/base/types'

export function matchesSearch(query: string, ...values: string[]): boolean {
  const text = values.join(' ').toLocaleLowerCase()
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every(word => text.includes(word))
}

/** Input order is the user's current homepage display order. */
export function searchQuickLinks(items: QuickUrlItem[], query: string): QuickUrlItem[] {
  const search = query.trim().toLocaleLowerCase()
  const terms = search.split(/\s+/).filter(Boolean)
  const rank = (item: QuickUrlItem) => {
    const title = item.title.toLocaleLowerCase()
    return !search || title === search
      ? 0
      : title.startsWith(search)
        ? 1
        : terms.every(word => title.includes(word))
          ? 2
          : 3
  }
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => matchesSearch(query, item.title, item.url))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index || a.item.id.localeCompare(b.item.id))
    .map(({ item }) => item)
}

export async function openSavedUrl(url: string, newTab = false): Promise<void> {
  new URL(url)
  if (newTab) await chrome.tabs.create({ url, active: true })
  else await chrome.tabs.update({ url })
}
