import { storage } from 'wxt/utils/storage'
import type { StorageItem } from '../core'
import { updateStorageItem } from '../core'
import type { QuickUrlItem } from '../base/types'

export const quickUrlItemsStorage = storage.defineItem<QuickUrlItem[]>('local:quick-url-item-storage-key', {
  fallback: [],
})

export const addUrlItem = <T extends QuickUrlItem>(item: StorageItem<T[]>, value: T) =>
  updateStorageItem(item, items => [...items, value])

export const removeUrlItemAt = <T extends QuickUrlItem>(item: StorageItem<T[]>, index: number) =>
  updateStorageItem(item, items => items.filter((_, itemIndex) => itemIndex !== index))

export const removeUrlItemById = <T extends QuickUrlItem>(item: StorageItem<T[]>, id: string) =>
  updateStorageItem(item, items => items.filter(value => value.id !== id))

export const putUrlItemById = <T extends QuickUrlItem>(item: StorageItem<T[]>, id: string, value: T) =>
  updateStorageItem(item, items => items.map(current => (current.id === id ? value : current)))

export const updateUrlItemPart = <T extends QuickUrlItem>(item: StorageItem<T[]>, startIndex: number, values: T[]) =>
  updateStorageItem(item, items => items.toSpliced(startIndex, values.length, ...values))

export const moveUrlItemById = <T extends QuickUrlItem>(item: StorageItem<T[]>, id: string, overId: string) =>
  updateStorageItem(item, items => {
    const oldIndex = items.findIndex(value => value.id === id)
    const newIndex = items.findIndex(value => value.id === overId)
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return items
    const reordered = [...items]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    return reordered
  })

export const addQuickUrl = (item: QuickUrlItem) => addUrlItem(quickUrlItemsStorage, item)
export const removeQuickUrlAt = (index: number) => removeUrlItemAt(quickUrlItemsStorage, index)
export const removeQuickUrlById = (id: string) => removeUrlItemById(quickUrlItemsStorage, id)
export const putQuickUrlById = (id: string, value: QuickUrlItem) => putUrlItemById(quickUrlItemsStorage, id, value)
export const updateQuickUrlPart = (startIndex: number, values: QuickUrlItem[]) =>
  updateUrlItemPart(quickUrlItemsStorage, startIndex, values)
export const moveQuickUrlById = (id: string, overId: string) => moveUrlItemById(quickUrlItemsStorage, id, overId)
