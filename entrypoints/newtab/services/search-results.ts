import type { NavigationItem } from '../components/navigation/navigation-list'

/** A deliberate bound: pagination counts only these loaded history matches, never the whole archive. */
export const HISTORY_SEARCH_LIMIT = 1000

export async function loadSearchResults(source: 'history' | 'bookmarks', query: string): Promise<NavigationItem[]> {
  const items =
    source === 'history'
      ? await chrome.history.search({ text: query.trim(), startTime: 0, maxResults: HISTORY_SEARCH_LIMIT })
      : await chrome.bookmarks.search({ query: query.trim() })
  return items.filter(item => item.url).map(item => ({ id: item.id, title: item.title || item.url!, url: item.url! }))
}
