import type { StorageItem } from '../core'

export interface IndexedDBConfig {
  dbName: string
  storeName: string
  version?: number
}

/** WXT-storage-shaped adapter for large, device-local values. */
export function createIndexedDBStorage<T>(key: string, fallback: T, config: IndexedDBConfig): StorageItem<T> {
  const { dbName, storeName, version = 1 } = config
  let listeners: Array<(newValue: T, oldValue: T | null) => void> = []

  function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error('IndexedDB is not available'))
        return
      }
      const request = indexedDB.open(dbName, version)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async function getValue(): Promise<T> {
    if (!globalThis.indexedDB) return fallback
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key)
      request.onsuccess = () => resolve((request.result as T | undefined) ?? fallback)
      request.onerror = () => reject(request.error)
    })
  }

  async function setValue(value: T): Promise<void> {
    const oldValue = await getValue()
    if (!globalThis.indexedDB) {
      listeners.forEach(listener => listener(value, oldValue))
      return
    }
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value, key)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
    listeners.forEach(listener => listener(value, oldValue))
  }

  async function removeValue(): Promise<void> {
    const oldValue = await getValue()
    if (globalThis.indexedDB) {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const request = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    }
    listeners.forEach(listener => listener(fallback, oldValue))
  }

  function watch(callback: (newValue: T, oldValue: T | null) => void): () => void {
    listeners = [...listeners, callback]
    return () => {
      listeners = listeners.filter(listener => listener !== callback)
    }
  }

  return { getValue, setValue, removeValue, watch }
}
