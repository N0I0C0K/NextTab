import {
  ACTIVITY_BYTE_BUDGET,
  ACTIVITY_RETENTION_MS,
  type ActivityEvent,
  type ActivityPage,
  type ActivityReason,
  type ActivitySnapshot,
  type ActiveView,
  type ActivitySource,
  type ForegroundPage,
} from './model'

export const ACTIVITY_DB_NAME = 'nexttab-page-activity'
type StoredPage = ActivityPage & { bytes: number }
type StoredEvent = ActivityEvent & { bytes: number }
type StoreMeta = { key: 'usage'; bytes: number }

const result = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const complete = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('Activity transaction aborted'))
    transaction.onerror = () => reject(transaction.error)
  })

// This is a serialized-content budget, excluding IndexedDB's internal indexes and allocation overhead.
const byteSize = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength

export class ActivityLogStore {
  private database?: Promise<IDBDatabase>

  constructor(
    private name = ACTIVITY_DB_NAME,
    private budget = ACTIVITY_BYTE_BUDGET,
  ) {}

  private open() {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.name, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        const pages = db.createObjectStore('pages', { keyPath: 'id', autoIncrement: true })
        pages.createIndex('key', 'key', { unique: true })
        const events = db.createObjectStore('events', { keyPath: 'id', autoIncrement: true })
        events.createIndex('at', 'at')
        events.createIndex('viewId', 'viewId')
        events.createIndex('pageId', 'pageId')
        db.createObjectStore('meta', { keyPath: 'key' })
      }
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close()
        resolve(request.result)
      }
      request.onerror = () => {
        this.database = undefined
        reject(request.error)
      }
    })
    return this.database
  }

  private async write<T>(operation: (transaction: IDBTransaction, meta: StoreMeta) => Promise<T>): Promise<T> {
    const db = await this.open()
    const transaction = db.transaction(['pages', 'events', 'meta'], 'readwrite')
    const done = complete(transaction)
    try {
      const meta: StoreMeta = (await result(transaction.objectStore('meta').get('usage'))) ?? {
        key: 'usage',
        bytes: 0,
      }
      const value = await operation(transaction, meta)
      await result(transaction.objectStore('meta').put(meta))
      await done
      return value
    } catch (error) {
      try {
        transaction.abort()
      } catch {
        // It may already have aborted because a request failed.
      }
      await done.catch(() => {})
      throw error
    }
  }

  private async page(transaction: IDBTransaction, meta: StoreMeta, value: ForegroundPage): Promise<StoredPage> {
    const pages = transaction.objectStore('pages')
    const existing = (await result(pages.index('key').get(value.key))) as StoredPage | undefined
    const body = { key: value.key, url: value.url, title: value.title.slice(0, 512) }
    if (existing) {
      // Construct explicitly so legacy reference counters disappear on the next update.
      const updated = { id: existing.id, ...body, bytes: byteSize({ id: existing.id, ...body }) }
      meta.bytes += updated.bytes - existing.bytes
      await result(pages.put(updated))
      return updated
    }
    const id = Number(await result(pages.add({ ...body, bytes: 0 })))
    const page = { id, ...body, bytes: byteSize({ id, ...body }) }
    meta.bytes += page.bytes
    await result(pages.put(page))
    return page
  }

  private async append(transaction: IDBTransaction, meta: StoreMeta, event: Omit<ActivityEvent, 'id'>) {
    const events = transaction.objectStore('events')
    const id = Number(await result(events.add({ ...event, bytes: 0 })))
    const row = { id, ...event, bytes: byteSize({ id, ...event }) }
    await result(events.put(row))
    meta.bytes += row.bytes
  }

  private async removeView(transaction: IDBTransaction, meta: StoreMeta, viewId: string) {
    const events = transaction.objectStore('events')
    const rows = (await result(events.index('viewId').getAll(viewId))) as StoredEvent[]
    await Promise.all(rows.map(row => result(events.delete(row.id))))
    for (const row of rows) {
      meta.bytes -= row.bytes
    }
    const pages = transaction.objectStore('pages')
    for (const id of new Set(rows.map(row => row.pageId))) {
      // Existence needs one indexed key, not a count of every retained visit.
      if ((await result(events.index('pageId').getKey(id))) !== undefined) continue
      const page = (await result(pages.get(id))) as StoredPage | undefined
      if (!page) continue
      await result(pages.delete(id))
      meta.bytes -= page.bytes
    }
    meta.bytes = Math.max(0, meta.bytes)
  }

  private async pruneTransaction(
    transaction: IDBTransaction,
    meta: StoreMeta,
    now: number,
    activeViewId: string | null,
  ) {
    const events = transaction.objectStore('events')
    const index = events.index('at')
    // Removing a whole view also removes its paired leave and unreferenced page metadata.
    const range = IDBKeyRange.upperBound(now - ACTIVITY_RETENTION_MS)
    const expiredCount = await result(index.count(range))
    if (expiredCount) {
      // After a long absence, native clear avoids thousands of per-view requests.
      if (expiredCount === (await result(events.count()))) {
        await Promise.all([result(events.clear()), result(transaction.objectStore('pages').clear())])
        meta.bytes = 0
        return
      }
      const expired = (await result(index.getAll(range))) as StoredEvent[]
      for (const viewId of new Set(expired.map(event => event.viewId))) {
        await this.removeView(transaction, meta, viewId)
      }
    }
    while (meta.bytes > this.budget) {
      const oldest = await new Promise<StoredEvent | undefined>((resolve, reject) => {
        const request = index.openCursor()
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) return resolve(undefined)
          if ((cursor.value as StoredEvent).viewId === activeViewId) cursor.continue()
          else resolve(cursor.value as StoredEvent)
        }
      })
      if (!oldest) throw new Error('Active page exceeds the activity log budget')
      await this.removeView(transaction, meta, oldest.viewId)
    }
  }

  /** Both transition events commit together; no elapsed time or score is stored. */
  async transition(
    current: ActiveView | null,
    next: ForegroundPage | null,
    at: number,
    source: ActivitySource,
    reason?: ActivityReason,
  ): Promise<ActiveView | null> {
    const reasonFor = (type: ActivityEvent['type']): ActivityReason => {
      if (reason) return reason
      if (source === 'window') {
        if (current && next && current.windowId !== next.windowId) return 'window-switch'
        return type === 'leave' ? 'window-blur' : 'window-focus'
      }
      return (
        {
          tab: 'tab-switch',
          navigation: 'navigation',
          startup: 'startup',
          removed: 'tab-close',
          settings: 'settings-change',
        } as const
      )[source]
    }
    return this.write(async (transaction, meta) => {
      const events = transaction.objectStore('events')
      if (current) {
        const previous = (await result(events.index('viewId').getAll(current.viewId))) as StoredEvent[]
        if (previous.some(event => event.type === 'enter') && !previous.some(event => event.type === 'leave')) {
          await this.append(transaction, meta, {
            viewId: current.viewId,
            pageId: current.pageId,
            type: 'leave',
            at,
            source,
            reason: reasonFor('leave'),
          })
        }
      }
      let active: ActiveView | null = null
      if (next) {
        const page = await this.page(transaction, meta, next)
        const viewId = crypto.randomUUID()
        await this.append(transaction, meta, {
          viewId,
          pageId: page.id,
          type: 'enter',
          at,
          source,
          reason: reasonFor('enter'),
        })
        active = { ...next, pageId: page.id, viewId, enteredAt: at }
      }
      await this.pruneTransaction(transaction, meta, at, active?.viewId ?? null)
      return active
    })
  }

  async updatePage(value: ForegroundPage, at: number, activeViewId: string) {
    await this.write(async (transaction, meta) => {
      // A ten-day-old view may already have been pruned; do not recreate orphan metadata.
      if ((await result(transaction.objectStore('events').index('viewId').count(activeViewId))) > 0) {
        await this.page(transaction, meta, value)
      }
      await this.pruneTransaction(transaction, meta, at, activeViewId)
    })
  }

  async prune(now: number, activeViewId: string | null = null) {
    await this.write((transaction, meta) => this.pruneTransaction(transaction, meta, now, activeViewId))
  }

  async snapshot(now: number, activeViewId: string | null): Promise<ActivitySnapshot> {
    await this.write((transaction, meta) => this.pruneTransaction(transaction, meta, now, activeViewId))
    const db = await this.open()
    const transaction = db.transaction(['pages', 'events', 'meta'], 'readonly')
    const done = complete(transaction)
    const [pages, events, meta] = await Promise.all([
      result(transaction.objectStore('pages').getAll()) as Promise<StoredPage[]>,
      result(transaction.objectStore('events').getAll()) as Promise<StoredEvent[]>,
      result(transaction.objectStore('meta').get('usage')) as Promise<StoreMeta>,
    ])
    await done
    return {
      pages: pages.map(({ id, key, url, title }) => ({ id, key, url, title })),
      events: events.map(({ id, viewId, pageId, type, at, source, reason }) => ({
        id,
        viewId,
        pageId,
        type,
        at,
        source,
        ...(reason ? { reason } : {}),
      })),
      activeViewId,
      now,
      bytes: meta.bytes,
    }
  }

  async forget(keys?: Set<string>) {
    await this.write(async (transaction, meta) => {
      if (!keys) {
        await Promise.all(['pages', 'events'].map(name => result(transaction.objectStore(name).clear())))
        meta.bytes = 0
        return
      }
      const pages = transaction.objectStore('pages')
      for (const key of keys) {
        const page = (await result(pages.index('key').get(key))) as StoredPage | undefined
        if (!page) continue
        const events = (await result(
          transaction.objectStore('events').index('pageId').getAll(page.id),
        )) as StoredEvent[]
        for (const viewId of new Set(events.map(event => event.viewId)))
          await this.removeView(transaction, meta, viewId)
      }
    })
  }

  async close() {
    if (this.database) (await this.database).close()
    this.database = undefined
  }
}
