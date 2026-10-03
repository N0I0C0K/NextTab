import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { vi } from 'vitest'
import { ACTIVITY_RETENTION_MS, ACTIVITY_WINDOW_MS, DAY_MS, type ActivitySnapshot, type ActiveView } from './model'
import { ActivityLogStore } from './store'
import { ForegroundActivityTracker } from './tracker'
import { scoreActivity, type ActivityScoreDiagnostic } from './scoring'

const now = new Date(2026, 9, 1, 12).getTime()
const page = (name = 'a') => ({
  tabId: 1,
  windowId: 1,
  key: `https://site.example/${name}`,
  url: `https://site.example/${name}`,
  title: name,
})
const tab = (name = 'a', id = 1): chrome.tabs.Tab => ({
  id,
  windowId: 1,
  url: page(name).url,
  title: name,
  active: true,
  incognito: false,
  index: 0,
  pinned: false,
  highlighted: false,
  selected: false,
  discarded: false,
  autoDiscardable: true,
  groupId: -1,
})
let stores: ActivityLogStore[]
const store = (budget?: number) => {
  const value = new ActivityLogStore(crypto.randomUUID(), budget)
  stores.push(value)
  return value
}
beforeEach(() => {
  stores = []
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})
afterEach(async () => {
  await Promise.all(stores.map(value => value.close()))
  vi.unstubAllGlobals()
})

describe('foreground activity log', () => {
  it('writes paired events atomically, reuses page metadata, and preserves the newest full URL', async () => {
    const log = store()
    let active = await log.transition(null, page(), now - 300_000, 'tab')
    await log.transition(active, null, now - 240_000, 'window')
    active = await log.transition(null, { ...page(), url: `${page().url}?ref=next#intro` }, now - 120_000, 'tab')
    await log.transition(active, null, now - 60_000, 'window')
    const snapshot = await log.snapshot(now, null)
    expect(snapshot.pages).toHaveLength(1)
    expect(snapshot.pages[0].url).toContain('?ref=next#intro')
    expect(snapshot.events.map(event => event.type)).toEqual(['enter', 'leave', 'enter', 'leave'])
    expect(snapshot.events[0].viewId).toBe(snapshot.events[1].viewId)
    expect(snapshot.events[2].viewId).toBe(snapshot.events[3].viewId)
    expect(snapshot.bytes).toBeGreaterThan(0)
    expect(scoreActivity(snapshot)[0].usage).toMatchObject({ views: 2, medianSeconds: 60, totalSeconds: 120 })
  })

  it('reads legacy logs without guessing reasons or changing their usage statistics', async () => {
    const databaseName = crypto.randomUUID()
    const log = new ActivityLogStore(databaseName)
    stores.push(log)
    let active = await log.transition(null, page(), now - 300_000, 'tab')
    await log.transition(active, null, now - 240_000, 'window')
    active = await log.transition(null, page(), now - 120_000, 'tab')
    await log.transition(active, null, now - 60_000, 'window')
    const original = await log.snapshot(now, null)
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction(['events', 'meta'], 'readwrite')
    const committed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    const rows = transaction.objectStore('events').getAll()
    rows.onsuccess = () => {
      let savedBytes = 0
      for (const row of rows.result) {
        delete row.reason
        const { bytes, ...body } = row
        row.bytes = new TextEncoder().encode(JSON.stringify(body)).byteLength
        savedBytes += bytes - row.bytes
        transaction.objectStore('events').put(row)
      }
      const meta = transaction.objectStore('meta').get('usage')
      meta.onsuccess = () =>
        transaction.objectStore('meta').put({ ...meta.result, bytes: meta.result.bytes - savedBytes })
    }
    await committed
    database.close()
    const legacy = await log.snapshot(now, null)
    expect(legacy.events.every(event => !('reason' in event))).toBe(true)
    expect(legacy.bytes).toBeLessThan(original.bytes)
    expect(scoreActivity(legacy)).toEqual(scoreActivity(original))
  })

  it('expires whole views at ten days, including their leave and unused URL metadata', async () => {
    const log = store()
    const old = await log.transition(null, page('old'), now - ACTIVITY_RETENTION_MS - 60_000, 'tab')
    await log.transition(old, null, now - ACTIVITY_RETENTION_MS + 30_000, 'window')
    const recent = await log.transition(null, page('recent'), now - 60_000, 'tab')
    await log.transition(recent, null, now - 10_000, 'window')
    const snapshot = await log.snapshot(now, null)
    expect(snapshot.pages.map(value => value.title)).toEqual(['recent'])
    expect(snapshot.events).toHaveLength(2)
    expect(snapshot.events.every(event => event.at > now - ACTIVITY_RETENTION_MS)).toBe(true)
    const bytes = snapshot.bytes
    await log.prune(now)
    expect((await log.snapshot(now, null)).bytes).toBe(bytes)
  })

  it('keeps a shared legacy page until its last view is removed and accounts for old bytes exactly', async () => {
    const name = crypto.randomUUID()
    const log = new ActivityLogStore(name)
    stores.push(log)
    let active = await log.transition(null, page(), now - 300_000, 'tab')
    await log.transition(active, null, now - 240_000, 'window')
    active = await log.transition(null, page(), now - 120_000, 'tab')
    await log.transition(active, null, now - 60_000, 'window')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction(['pages', 'meta'], 'readwrite')
    const committed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    const request = transaction.objectStore('pages').get(active!.pageId)
    request.onsuccess = () => {
      const { bytes: oldBytes, ...body } = request.result
      // A legacy counter must not control retention, even when it is stale.
      const legacy = { ...body, references: 999 }
      const bytes = new TextEncoder().encode(JSON.stringify(legacy)).byteLength
      transaction.objectStore('pages').put({ ...legacy, bytes })
      const meta = transaction.objectStore('meta').get('usage')
      meta.onsuccess = () =>
        transaction.objectStore('meta').put({ ...meta.result, bytes: meta.result.bytes + bytes - oldBytes })
    }
    await committed
    await log.prune(now + ACTIVITY_RETENTION_MS - 200_000)
    const retained = await log.snapshot(now + ACTIVITY_RETENTION_MS - 200_000, null)
    expect(retained.pages).toHaveLength(1)
    expect(retained.events).toHaveLength(2)
    await log.updatePage({ ...page(), title: 'updated' }, now, active!.viewId)
    const records = database.transaction(['pages', 'events'], 'readonly')
    const get = <T>(request: IDBRequest<T>) =>
      new Promise<T>(resolve => {
        request.onsuccess = () => resolve(request.result)
      })
    const [pages, events] = await Promise.all([
      get(records.objectStore('pages').getAll()),
      get(records.objectStore('events').getAll()),
    ])
    expect(pages[0]).not.toHaveProperty('references')
    expect((await log.snapshot(now, null)).bytes).toBe([...pages, ...events].reduce((sum, row) => sum + row.bytes, 0))
    await log.prune(now + ACTIVITY_RETENTION_MS + 1)
    expect(await log.snapshot(now + ACTIVITY_RETENTION_MS + 1, null)).toMatchObject({ pages: [], events: [], bytes: 0 })
    database.close()
  })

  it('bounds content bytes, removes oldest views in pairs and protects the active view', async () => {
    const log = store(1200)
    for (let i = 0; i < 12; i++) {
      const active = await log.transition(null, page(String(i)), now - (20 - i) * 60_000, 'tab')
      await log.transition(active, null, now - (20 - i) * 60_000 + 40_000, 'window')
    }
    const active = await log.transition(null, page('active'), now - 30_000, 'tab')
    const snapshot = await log.snapshot(now, active!.viewId)
    expect(snapshot.bytes).toBeLessThanOrEqual(1200)
    expect(snapshot.pages.map(value => value.title)).not.toContain('0')
    expect(snapshot.pages.map(value => value.title)).toContain('active')
    for (const viewId of new Set(snapshot.events.map(event => event.viewId))) {
      expect(snapshot.events.filter(event => event.viewId === viewId)).toHaveLength(viewId === active!.viewId ? 1 : 2)
    }
    expect(snapshot.pages.every(value => snapshot.events.some(event => event.pageId === value.id))).toBe(true)
  })

  it('rolls back oversized entries instead of losing the previous log', async () => {
    const log = store(1200)
    const active = await log.transition(null, page(), now - 60_000, 'tab')
    const before = await log.snapshot(now, active!.viewId)
    await expect(
      log.transition(active, { ...page('large'), url: `${page('large').url}?${'x'.repeat(2000)}` }, now, 'tab'),
    ).rejects.toThrow('budget')
    expect(await log.snapshot(now, active!.viewId)).toEqual(before)
  })

  it('purges all query variants on history deletion and frees their bytes', async () => {
    const log = store()
    const first = await log.transition(null, page(), now - 120_000, 'tab')
    const second = await log.transition(first, page('b'), now - 60_000, 'tab')
    await log.transition(second, null, now, 'window')
    await log.forget(new Set([page().key]))
    let snapshot = await log.snapshot(now, null)
    expect(snapshot.pages.map(value => value.title)).toEqual(['b'])
    expect(snapshot.events).toHaveLength(2)
    await log.forget()
    snapshot = await log.snapshot(now, null)
    expect(snapshot).toMatchObject({ pages: [], events: [], bytes: 0 })
  })
})

describe('foreground transitions', () => {
  it('deduplicates overlapping activation/focus events, reloads and query changes', async () => {
    const log = store()
    let state: { current: ActiveView | null } = { current: null }
    const tracker = new ForegroundActivityTracker(log, async value => {
      state = value
    })
    await tracker.enter(tab(), now - 120_000, 'tab')
    const viewId = tracker.activeViewId
    await tracker.enter(tab(), now - 119_000, 'window')
    await tracker.enter({ ...tab(), url: `${page().url}?ref=b#intro`, title: 'updated' }, now - 118_000, 'navigation')
    expect(tracker.activeViewId).toBe(viewId)
    const active = await log.snapshot(now, tracker.activeViewId)
    expect(active.events).toHaveLength(1)
    expect(active.pages[0].title).toBe('updated')
    await tracker.enter(null, now - 60_000, 'window')
    expect(state.current).toBeNull()
    expect((await log.snapshot(now, null)).events.map(event => event.type)).toEqual(['enter', 'leave'])
  })

  it('continues a view after worker suspension, but ignores an unfinished view after browser restart', async () => {
    const log = store()
    let state: { current: ActiveView | null } = { current: null }
    const tracker = new ForegroundActivityTracker(log, async value => {
      state = value
    })
    await tracker.enter(tab(), now - 300_000, 'tab')
    const restored = new ForegroundActivityTracker(log, async value => {
      state = value
    })
    restored.restore(state)
    await restored.enter(tab(), now - 240_000, 'startup')
    expect((await log.snapshot(now, restored.activeViewId)).events).toHaveLength(1)
    await restored.enter(null, now - 180_000, 'window')
    await restored.enter(tab(), now - 120_000, 'tab')
    // Simulate browser restart: storage.session is empty; no leave is invented for the old view.
    const restarted = new ForegroundActivityTracker(log, async value => {
      state = value
    })
    await restarted.enter(tab(), now - 60_000, 'startup')
    await restarted.enter(null, now, 'window')
    const snapshot = await log.snapshot(now, null)
    expect(snapshot.events).toHaveLength(5)
    expect(scoreActivity(snapshot)[0].usage).toMatchObject({ views: 2, totalSeconds: 180 })
  })

  it('counts same-page tabs independently in the log and stops at internal and incognito pages', async () => {
    const log = store()
    const tracker = new ForegroundActivityTracker(log, async () => {})
    await tracker.enter(tab(), now - 180_000, 'tab')
    await tracker.enter(tab('a', 2), now - 120_000, 'tab')
    await tracker.enter({ ...tab(), url: 'chrome://newtab/' }, now - 60_000, 'tab')
    await tracker.enter({ ...tab(), url: 'https://site.example/login' }, now - 50_000, 'navigation')
    await tracker.enter({ ...tab(), incognito: true }, now - 40_000, 'window')
    const snapshot = await log.snapshot(now, null)
    expect(snapshot.events).toHaveLength(6)
    expect(snapshot.pages).toHaveLength(2)
    expect(tracker.activeViewId).toBeNull()
  })
})

function fixture(views: Array<{ page?: number; start: number; seconds: number; open?: boolean }>): ActivitySnapshot {
  return {
    now,
    bytes: 0,
    pages: [1, 2].map(id => ({
      id,
      key: `https://site.example/${id}`,
      url: `https://site.example/${id}?ref=full`,
      title: String(id),
    })),
    activeViewId: views.some(view => view.open) ? String(views.findIndex(view => view.open)) : null,
    events: views.flatMap((view, i) => {
      const enter = {
        id: i * 2,
        viewId: String(i),
        pageId: view.page ?? 1,
        type: 'enter' as const,
        at: view.start,
        source: 'tab' as const,
      }
      return view.open
        ? [enter]
        : [enter, { ...enter, id: i * 2 + 1, type: 'leave' as const, at: view.start + view.seconds * 1000 }]
    }),
  }
}

describe('seven-day recommendation scores', () => {
  it('matches the agreed logarithmic reference scores and explains each daily contribution', () => {
    const diagnostics: ActivityScoreDiagnostic[] = []
    const snapshot = fixture(
      Array.from({ length: 4 }, (_, i) => ({
        start: now - (4 - i) * 700_000,
        seconds: 600,
      })),
    )
    const scored = scoreActivity(snapshot, diagnostic => diagnostics.push(diagnostic))
    expect(scored).toEqual(scoreActivity(snapshot))
    expect(scored[0].usage.score).toBeCloseTo(80.6771868836729, 10)
    const { factors, days } = diagnostics[0].breakdown!
    expect(days).toMatchObject([
      {
        date: '2026-10-01',
        views: 4,
        medianSeconds: 600,
        totalSeconds: 2400,
        decay: 1,
      },
    ])
    expect(Object.values(factors).reduce((sum, points) => sum + points, 0)).toBeCloseTo(scored[0].usage.score, 10)
    expect(days.reduce((sum, day) => sum + day.score, 0)).toBeCloseTo(scored[0].usage.score, 10)
    expect(scoreActivity(fixture([{ start: now - 700_000, seconds: 600 }]))[0].usage.score).toBeCloseTo(
      54.67209362953538,
      10,
    )
  })

  it('scores brief scans and single visits without a duration or count gate', () => {
    const scored = scoreActivity(
      fixture([
        { start: now - 600_000, seconds: 3 },
        { start: now - 500_000, seconds: 5 },
        { page: 2, start: now - 120_000, seconds: 60 },
      ]),
    )
    expect(scored).toHaveLength(2)
    expect(scored.every(page => page.usage.score > 0)).toBe(true)
    expect(scored.find(page => page.id.endsWith('/1'))?.usage).toMatchObject({ views: 2, totalSeconds: 8 })
    expect(scored.find(page => page.id.endsWith('/2'))?.usage).toMatchObject({ views: 1, totalSeconds: 60 })
  })

  it('ignores only invalid pairs, orphan leaves, future events and intervals outside seven days', () => {
    const snapshot = fixture([
      { start: now - ACTIVITY_WINDOW_MS - 300_000, seconds: 60 },
      { start: now + 60_000, seconds: 60 },
      { start: now - 60_000, seconds: 0 },
      { start: now - 100_000, seconds: -1 },
    ])
    snapshot.events.push({ id: 99, viewId: 'orphan', pageId: 1, type: 'leave', at: now, source: 'tab' })
    expect(scoreActivity(snapshot)).toEqual([])
  })

  it('keeps brief returns independent without charging time spent away', () => {
    const scored = scoreActivity(
      fixture([
        { start: now - 600_000, seconds: 20 },
        { start: now - 570_000, seconds: 20 },
        { start: now - 120_000, seconds: 60 },
      ]),
    )[0]
    expect(scored.usage).toMatchObject({ views: 3, totalSeconds: 100, medianSeconds: 20, activeDays: 1 })
  })

  it('preserves the two GitHub returns from the exported log despite a brief absence', () => {
    const scored = scoreActivity(
      fixture([
        { start: now - 106_822, seconds: 34.284 },
        { start: now - 58_087, seconds: 58.087 },
      ]),
    )[0]
    expect(scored.usage).toMatchObject({ views: 2, tabSwitches: 2 })
    expect(scored.usage.totalSeconds).toBeCloseTo(92.371)
    expect(scored.usage.medianSeconds).toBeCloseTo(46.1855)
  })

  it('counts adjacent same-page tab entries independently', () => {
    const scored = scoreActivity(
      fixture([
        { start: now - 60_000, seconds: 30 },
        { start: now - 30_000, seconds: 30 },
      ]),
    )[0]
    expect(scored.usage).toMatchObject({ views: 2, totalSeconds: 60, medianSeconds: 30 })
  })

  it('scores the active view at query time but does not guess abandoned unfinished stays', () => {
    const snapshot = fixture([
      { start: now - 300_000, seconds: 60 },
      { start: now - 120_000, seconds: 0, open: true },
    ])
    expect(scoreActivity(snapshot)[0].usage).toMatchObject({ views: 2, totalSeconds: 180 })
    expect(scoreActivity({ ...snapshot, activeViewId: null })[0].usage).toMatchObject({ views: 1, totalSeconds: 60 })
    expect(snapshot.events).toHaveLength(3)
  })

  it('continues gaining score beyond old duration and count caps with diminishing increments', () => {
    const score = (seconds: number) => scoreActivity(fixture([{ start: now - seconds * 1000, seconds }]))[0].usage.score
    expect(score(3600)).toBeCloseTo(85.0542651202274, 10)
    expect(score(600)).toBeGreaterThan(score(120))
    expect(score(3600)).toBeGreaterThan(score(600))
    expect(score(7200)).toBeGreaterThan(score(3600))
    expect(score(7200) - score(3600)).toBeLessThan(score(3600) - score(600))
    const many = (count: number) =>
      scoreActivity(
        fixture(
          Array.from({ length: count }, (_, i) => ({
            start: now - (count - i) * 240_000,
            seconds: 180,
          })),
        ),
      )[0].usage.score
    expect(many(8)).toBeGreaterThan(many(4))
    expect(many(16)).toBeGreaterThan(many(8))
    expect(many(12) - many(8)).toBeLessThan(many(8) - many(4))
  })

  it('decays each date continuously from its fixed day-end anchor', () => {
    const snapshot = fixture([{ start: now - DAY_MS - 120_000, seconds: 60 }])
    const initial = scoreActivity(snapshot)[0].usage.score
    expect(scoreActivity({ ...snapshot, now: now + 3 * DAY_MS })[0].usage.score).toBeCloseTo(initial / 2, 10)
    expect(scoreActivity({ ...snapshot, now: now + 3_600_000 })[0].usage.score).toBeCloseTo(
      initial * 2 ** (-1 / 72),
      10,
    )
  })

  it('a new visit adds today’s score without rejuvenating old days', () => {
    const old = fixture([{ start: now - 3 * DAY_MS - 120_000, seconds: 60 }])
    const recent = fixture([{ start: now - 1000, seconds: 1 }])
    const combined = fixture([
      { start: now - 3 * DAY_MS - 120_000, seconds: 60 },
      { start: now - 1000, seconds: 1 },
    ])
    expect(scoreActivity(combined)[0].usage.score).toBeCloseTo(
      scoreActivity(old)[0].usage.score + scoreActivity(recent)[0].usage.score,
      10,
    )
  })

  it('splits midnight dwell by local date without inventing another entry', () => {
    const midnight = new Date(2026, 9, 1).getTime()
    const diagnostics: ActivityScoreDiagnostic[] = []
    const result = scoreActivity(fixture([{ start: midnight - 30_000, seconds: 90 }]), diagnostic =>
      diagnostics.push(diagnostic),
    )[0]
    expect(result.usage).toMatchObject({ views: 1, totalSeconds: 90, medianSeconds: 90, activeDays: 2 })
    const days = diagnostics[0].breakdown!.days
    expect(days).toMatchObject([
      { date: '2026-09-30', views: 1, medianSeconds: 30, totalSeconds: 30, hoursSinceDayEnd: 12 },
      { date: '2026-10-01', views: 0, medianSeconds: 60, totalSeconds: 60, decay: 1 },
    ])
    expect(days[0].decay).toBeCloseTo(2 ** (-12 / 72), 10)
  })

  it('clips the seven-day boundary and deduplicates overlapping intervals and repeated events', () => {
    const snapshot = fixture([
      { start: now - ACTIVITY_WINDOW_MS - 30_000, seconds: 60 },
      { start: now - 120_000, seconds: 60 },
      { start: now - 100_000, seconds: 60 },
    ])
    snapshot.events.push(...snapshot.events.map(event => ({ ...event, id: event.id + 100 })))
    expect(scoreActivity(snapshot)[0].usage).toMatchObject({ totalSeconds: 110, views: 2, tabSwitches: 3 })
  })
})
