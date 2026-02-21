import type { BaseStorage, ValueOrUpdate } from './types'

export interface IndexedDBConfig {
  /**
   * Name of the IndexedDB database
   */
  dbName: string
  /**
   * Name of the object store within the database
   */
  storeName: string
  /**
   * Version of the database schema
   * @default 1
   */
  version?: number
}

/**
 * Generic IndexedDB storage implementation that provides chrome.storage-like API
 * but uses IndexedDB for unlimited storage capacity.
 *
 * Benefits over chrome.storage.local:
 * - No ~10MB quota limit (IndexedDB has much higher limits, typically GBs)
 * - Data never syncs across devices (perfect for device-specific content)
 * - Better for large binary data (images, videos, etc.)
 *
 * Trade-offs:
 * - Slightly more complex API
 * - Not available in all contexts (e.g., Tailwind build process)
 * - No automatic sync across extension contexts (must implement manually if needed)
 */
export function createIndexedDBStorage<D>(
  key: string,
  fallback: D,
  config: IndexedDBConfig,
): BaseStorage<D> {
  const { dbName, storeName, version = 1 } = config

  let cache: D | null = null
  let listeners: Array<() => void> = []

  /**
   * Opens (or creates) the IndexedDB database.
   */
  function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      // Guard for environments without IndexedDB (e.g., Tailwind build tooling)
      if (!globalThis.indexedDB) {
        reject(new Error('IndexedDB is not available'))
        return
      }
      const request = indexedDB.open(dbName, version)
      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  const emitChange = () => listeners.forEach(l => l())

  const get = async (): Promise<D> => {
    if (!globalThis.indexedDB) return fallback
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.get(key)
      request.onsuccess = () => resolve((request.result as D | undefined) ?? fallback)
      request.onerror = () => reject(request.error)
    })
  }

  const set = async (valueOrUpdate: ValueOrUpdate<D>) => {
    const prev = cache ?? (await get())
    const next = typeof valueOrUpdate === 'function' ? await (valueOrUpdate as (prev: D) => D | Promise<D>)(prev) : valueOrUpdate
    cache = next

    if (!globalThis.indexedDB) {
      emitChange()
      return
    }

    const db = await openDatabase()
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = store.put(next, key)
      request.onsuccess = () => {
        emitChange()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }

  const remove = async () => {
    cache = fallback

    if (!globalThis.indexedDB) {
      emitChange()
      return
    }

    const db = await openDatabase()
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = store.delete(key)
      request.onsuccess = () => {
        emitChange()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }

  const subscribe = (listener: () => void) => {
    listeners = [...listeners, listener]
    return () => {
      listeners = listeners.filter(l => l !== listener)
    }
  }

  const getSnapshot = (): D | null => cache

  // Warm up the cache on module initialisation
  get()
    .then(data => {
      cache = data
      emitChange()
    })
    .catch(err => {
      console.error(`Failed to initialize IndexedDB storage for key "${key}":`, err)
    })

  return {
    get,
    set,
    remove,
    getSnapshot,
    subscribe,
  }
}
