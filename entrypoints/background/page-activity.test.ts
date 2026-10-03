import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { ACTIVITY_SNAPSHOT_MESSAGE, type ActivitySnapshot } from '@/utils/page-activity/model'
import { ACTIVITY_DB_NAME } from '@/utils/page-activity/store'
import { startPageActivityService } from './page-activity'

function event<Args extends unknown[]>() {
  const listeners: Array<(...args: Args) => unknown> = []
  return {
    addListener: (listener: (...args: Args) => unknown) => listeners.push(listener),
    emit: (...args: Args) => listeners.forEach(listener => listener(...args)),
    listeners,
  }
}

function fixture() {
  const pages = new Map([
    [1, { id: 1, windowId: 1, url: 'https://site.example/a', title: 'A', incognito: false }],
    [2, { id: 2, windowId: 2, url: 'https://site.example/b', title: 'B', incognito: false }],
    [3, { id: 3, windowId: 1, url: 'chrome-extension://test/newtab.html', title: 'New tab', incognito: false }],
    [4, { id: 4, windowId: 1, url: 'https://site.example/d', title: 'D', incognito: false }],
  ])
  let focused: number | null = 1
  const active = new Map([
    [1, 3],
    [2, 2],
  ])
  const session: Record<string, unknown> = {}
  const tab = (id: number) => {
    const page = pages.get(id)!
    return { ...page, active: active.get(page.windowId) === id } as chrome.tabs.Tab
  }
  const windows = () => [1, 2].map(id => ({ id, focused: focused === id, state: 'normal' as const }))
  const chromeFixture = {
    extension: { inIncognitoContext: false },
    tabs: {
      query: vi.fn(async ({ windowId }: { windowId: number }) => [tab(active.get(windowId)!)]),
      get: vi.fn(async (id: number) => tab(id)),
      onActivated: event<[chrome.tabs.TabActiveInfo]>(),
      onUpdated: event<[number, chrome.tabs.TabChangeInfo, chrome.tabs.Tab]>(),
      onRemoved: event<[number]>(),
      onAttached: event<[number]>(),
      onReplaced: event<[number]>(),
    },
    windows: {
      WINDOW_ID_NONE: -1,
      getAll: vi.fn(async () => windows()),
      get: vi.fn(async (id: number) => windows().find(window => window.id === id)!),
      onFocusChanged: event<[number]>(),
    },
    storage: {
      session: {
        get: vi.fn(async () => ({ ...session })),
        set: vi.fn(async (value: Record<string, unknown>) => {
          Object.assign(session, value)
        }),
      },
      local: { get: vi.fn<(_key: string) => Promise<Record<string, unknown>>>(async () => ({})) },
      onChanged: event<[Record<string, { newValue?: unknown }>, string]>(),
    },
    history: { onVisitRemoved: event<[chrome.history.RemovedResult]>() },
    alarms: { get: vi.fn(async () => ({})), create: vi.fn(), onAlarm: event<[chrome.alarms.Alarm]>() },
    runtime: {
      id: 'test',
      onMessage: event<[unknown, chrome.runtime.MessageSender, (response: ActivitySnapshot) => void]>(),
    },
  }
  const snapshot = () =>
    new Promise<ActivitySnapshot>(resolve => {
      chromeFixture.runtime.onMessage.emit({ type: ACTIVITY_SNAPSHOT_MESSAGE }, { id: 'test' }, resolve)
    })
  const activate = (id: number) => {
    const page = pages.get(id)!
    active.set(page.windowId, id)
    chromeFixture.tabs.onActivated.emit({ tabId: id, windowId: page.windowId })
  }
  const focus = (id: number | null) => {
    focused = id
    chromeFixture.windows.onFocusChanged.emit(id ?? -1)
  }
  const setFocused = (id: number | null) => {
    focused = id
  }
  return { chromeFixture, snapshot, activate, focus, setFocused, active, tab }
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})
afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(ACTIVITY_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('background page activity events', () => {
  it('honors the existing homepage switch at startup and stops recording when it is turned off', async () => {
    const { chromeFixture, snapshot, activate, active } = fixture()
    active.set(1, 1)
    chromeFixture.storage.local.get.mockImplementation(async key =>
      key === 'settings-storage' ? { 'settings-storage': { showRecentPages: false } } : {},
    )
    vi.stubGlobal('chrome', chromeFixture)
    startPageActivityService()
    expect((await snapshot()).events).toEqual([])
    activate(4)
    expect((await snapshot()).events).toEqual([])

    chromeFixture.storage.onChanged.emit({ 'settings-storage': { newValue: { showRecentPages: true } } }, 'local')
    expect((await snapshot()).events.map(event => event.type)).toEqual(['enter'])
    chromeFixture.storage.onChanged.emit({ 'settings-storage': { newValue: { showRecentPages: false } } }, 'local')
    const disabled = await snapshot()
    expect(disabled.events.map(event => event.type)).toEqual(['enter', 'leave'])
    expect(disabled.events.at(-1)?.reason).toBe('settings-change')
    expect(disabled.activeViewId).toBeNull()
    activate(1)
    expect((await snapshot()).events).toEqual(disabled.events)
  })

  it.each([
    ['session', true],
    ['local', true],
    ['session', false],
    ['local', false],
  ] as const)('recovers after a failed %s initialization without bypassing enabled=%s', async (area, enabled) => {
    const { chromeFixture, snapshot, focus, active } = fixture()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    active.set(1, 1)
    chromeFixture.storage.local.get.mockResolvedValue({ 'settings-storage': { showRecentPages: enabled } })
    chromeFixture.storage[area].get.mockRejectedValueOnce(new Error('Transient storage failure'))
    vi.stubGlobal('chrome', chromeFixture)
    startPageActivityService()
    // Startup fails; a later request must re-read both settings and session before recording anything.
    const resumed = await snapshot()
    expect(chromeFixture.storage[area].get).toHaveBeenCalledTimes(2)
    expect(resumed.events.map(event => event.type)).toEqual(enabled ? ['enter'] : [])
    focus(null)
    const paused = await snapshot()
    expect(paused.events.map(event => event.type)).toEqual(enabled ? ['enter', 'leave'] : [])
    expect(paused.activeViewId).toBeNull()
  })

  it('preserves rapid event targets while writes are queued, even when tabs.get resolves after they become inactive', async () => {
    const { chromeFixture, snapshot, activate, focus, tab } = fixture()
    vi.stubGlobal('chrome', chromeFixture)
    startPageActivityService()
    await snapshot()
    const pending: Array<() => void> = []
    chromeFixture.tabs.get.mockImplementation(
      id => new Promise(resolve => pending.push(() => resolve({ ...tab(id), active: false }))),
    )
    activate(1)
    focus(2)
    activate(2)
    focus(1)
    activate(1)
    focus(null)
    pending.forEach(resolve => resolve())
    const log = await snapshot()
    const visited = log.events
      .filter(value => value.type === 'enter')
      .map(value => log.pages.find(page => page.id === value.pageId)?.title)
    expect(visited).toEqual(['A', 'B', 'A'])
    expect(log.events.map(value => value.type)).toEqual(['enter', 'leave', 'enter', 'leave', 'enter', 'leave'])
    expect(log.activeViewId).toBeNull()
  })

  it('ignores background-window activation, pauses outside Chrome and resumes the foreground window', async () => {
    const { chromeFixture, snapshot, activate, focus } = fixture()
    vi.stubGlobal('chrome', chromeFixture)
    startPageActivityService()
    await snapshot()
    activate(1)
    const first = await snapshot()
    activate(2)
    expect((await snapshot()).events).toEqual(first.events)
    focus(null)
    const paused = await snapshot()
    expect(paused.events.map(value => value.type)).toEqual(['enter', 'leave'])
    focus(1)
    const resumed = await snapshot()
    expect(resumed.events.map(value => value.type)).toEqual(['enter', 'leave', 'enter'])
    expect(resumed.events.at(-1)?.source).toBe('window')
  })

  it('distinguishes tab switches, tab closure, window blur and window focus in persisted snapshots', async () => {
    const { chromeFixture, snapshot, activate, focus, active } = fixture()
    vi.stubGlobal('chrome', chromeFixture)
    startPageActivityService()
    await snapshot()
    activate(1)
    await snapshot()
    activate(4)
    await snapshot()
    active.set(1, 3)
    chromeFixture.tabs.onRemoved.emit(4)
    await snapshot()
    focus(2)
    await snapshot()
    focus(null)
    const paused = await snapshot()
    expect(paused.activeViewId).toBeNull()
    focus(2)
    const resumed = await snapshot()
    expect(resumed.events.map(({ type, source, reason }) => ({ type, source, reason }))).toEqual([
      { type: 'enter', source: 'tab', reason: 'tab-switch' },
      { type: 'leave', source: 'tab', reason: 'tab-switch' },
      { type: 'enter', source: 'tab', reason: 'tab-switch' },
      { type: 'leave', source: 'removed', reason: 'tab-close' },
      { type: 'enter', source: 'window', reason: 'window-focus' },
      { type: 'leave', source: 'window', reason: 'window-blur' },
      { type: 'enter', source: 'window', reason: 'window-focus' },
    ])
    expect(resumed.events.slice(0, paused.events.length)).toEqual(paused.events)
  })

  it('distinguishes changing Chrome windows from leaving Chrome', async () => {
    const { chromeFixture, snapshot, activate, focus } = fixture()
    vi.stubGlobal('chrome', chromeFixture)
    startPageActivityService()
    await snapshot()
    activate(1)
    await snapshot()
    focus(2)
    const switched = await snapshot()
    expect(switched.events.slice(-2).map(event => event.reason)).toEqual(['window-switch', 'window-switch'])
    focus(null)
    const blurred = await snapshot()
    expect(blurred.events.at(-1)).toMatchObject({ type: 'leave', reason: 'window-blur' })
  })

  it('marks snapshot reconciliation separately instead of inventing a window-focus event', async () => {
    const { chromeFixture, snapshot, activate, setFocused } = fixture()
    vi.stubGlobal('chrome', chromeFixture)
    startPageActivityService()
    await snapshot()
    activate(1)
    await snapshot()
    setFocused(null)
    const corrected = await snapshot()
    expect(corrected.events.at(-1)).toMatchObject({ type: 'leave', source: 'window', reason: 'reconcile' })
    expect(corrected.activeViewId).toBeNull()
    setFocused(1)
    expect((await snapshot()).events.at(-1)).toMatchObject({ type: 'enter', reason: 'reconcile' })
  })
})
