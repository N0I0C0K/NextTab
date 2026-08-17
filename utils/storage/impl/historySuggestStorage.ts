import moment from 'moment'
import { storage } from 'wxt/utils/storage'
import type { QuickUrlItem } from '../base/types'
import { quickUrlItemsStorage, removeUrlItemById } from './quickUrlStorage'

export type HistoryItem = QuickUrlItem & { lastVisitTime?: number; visitCount?: number }

export const historySuggestStorage = storage.defineItem<HistoryItem[]>('local:history-suggest-url-item-storage-key', {
  fallback: [],
})

export const removeHistorySuggestionById = (id: string) => removeUrlItemById(historySuggestStorage, id)

export async function refreshHistorySuggestions(): Promise<void> {
  const quickUrls = await quickUrlItemsStorage.getValue()
  const knownHosts = new Set(quickUrls.map(value => new URL(value.url).host))
  const history = await chrome.history.search({
    text: '',
    maxResults: 1000,
    startTime: moment().subtract(30, 'days').valueOf(),
  })
  const suggestions: HistoryItem[] = []
  for (const item of history.sort((left, right) => (right.visitCount ?? 0) - (left.visitCount ?? 0))) {
    if (!item.url) continue
    const host = new URL(item.url).host
    if (knownHosts.has(host)) continue
    knownHosts.add(host)
    suggestions.push({
      id: item.id,
      title: item.title ?? 'missing',
      url: item.url,
      lastVisitTime: item.lastVisitTime,
      visitCount: item.visitCount,
    })
    if (suggestions.length >= 50) break
  }
  await historySuggestStorage.setValue(suggestions)
}
