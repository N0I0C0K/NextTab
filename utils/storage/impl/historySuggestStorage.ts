import moment from 'moment'
import { storage } from 'wxt/utils/storage'
import type { QuickUrlItem } from '../base/types'
import { quickUrlItemsStorage, removeUrlItemById } from './quickUrlStorage'

export type HistoryItem = QuickUrlItem & { lastVisitTime?: number; visitCount?: number }

export const historySuggestStorage = storage.defineItem<HistoryItem[]>('local:history-suggest-url-item-storage-key', {
  fallback: [],
})

export const removeHistorySuggestionById = (id: string) => removeUrlItemById(historySuggestStorage, id)

const getUrlHost = (url: string): string | null => {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

export function buildHistorySuggestions(
  quickUrls: QuickUrlItem[],
  history: chrome.history.HistoryItem[],
  limit = 50,
): HistoryItem[] {
  const knownHosts = new Set(quickUrls.map(value => getUrlHost(value.url)).filter((host): host is string => !!host))
  const suggestions: HistoryItem[] = []

  for (const item of [...history].sort((left, right) => (right.visitCount ?? 0) - (left.visitCount ?? 0))) {
    if (!item.url) continue
    const host = getUrlHost(item.url)
    if (!host || knownHosts.has(host)) continue

    knownHosts.add(host)
    suggestions.push({
      id: item.id,
      title: item.title ?? 'missing',
      url: item.url,
      lastVisitTime: item.lastVisitTime,
      visitCount: item.visitCount,
    })
    if (suggestions.length >= limit) break
  }

  return suggestions
}

export async function refreshHistorySuggestions(): Promise<void> {
  const quickUrls = await quickUrlItemsStorage.getValue()
  const history = await chrome.history.search({
    text: '',
    maxResults: 1000,
    startTime: moment().subtract(30, 'days').valueOf(),
  })
  await historySuggestStorage.setValue(buildHistorySuggestions(quickUrls, history))
}
