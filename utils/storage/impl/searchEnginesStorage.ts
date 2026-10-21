import { storage } from 'wxt/utils/storage'
import { updateStorageItem } from '../core'
import { searchEnginesSchema, type SearchEngine } from '@/utils/search-engines'

export const searchEnginesStorage = storage.defineItem<SearchEngine[]>('local:search-engines', { fallback: [] })

export function saveSearchEngine(engine: SearchEngine, existing = false): Promise<SearchEngine[]> {
  return updateStorageItem(searchEnginesStorage, current => {
    if (existing && !current.some(item => item.id === engine.id)) throw new Error('Engine no longer exists')
    return searchEnginesSchema.parse(
      existing ? current.map(item => (item.id === engine.id ? engine : item)) : [...current, engine],
    )
  })
}

export function updateSearchEngine(
  id: string,
  changes: Partial<Pick<SearchEngine, 'enabled'>>,
): Promise<SearchEngine[]> {
  return updateStorageItem(searchEnginesStorage, current =>
    searchEnginesSchema.parse(current.map(item => (item.id === id ? { ...item, ...changes } : item))),
  )
}

export function moveSearchEngine(id: string, direction: -1 | 1): Promise<SearchEngine[]> {
  return updateStorageItem(searchEnginesStorage, current => {
    const index = current.findIndex(item => item.id === id)
    const next = index + direction
    if (index < 0 || next < 0 || next >= current.length) return current
    const result = [...current]
    ;[result[index], result[next]] = [result[next], result[index]]
    return result
  })
}

export function removeSearchEngine(id: string): Promise<SearchEngine[]> {
  return updateStorageItem(searchEnginesStorage, current => current.filter(item => item.id !== id))
}

export function restoreSearchEngine(engine: SearchEngine, index: number): Promise<SearchEngine[]> {
  return updateStorageItem(searchEnginesStorage, current => {
    if (current.some(item => item.id === engine.id)) return current
    const result = [...current]
    result.splice(Math.min(index, result.length), 0, engine)
    return searchEnginesSchema.parse(result)
  })
}
