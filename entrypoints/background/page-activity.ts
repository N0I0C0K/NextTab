import {
  ACTIVITY_SESSION_KEY,
  ACTIVITY_SNAPSHOT_MESSAGE,
  normalizePageUrl,
  type ActivityReason,
  type ActivitySource,
} from '@/utils/page-activity/model'
import { ActivityLogStore } from '@/utils/page-activity/store'
import { ForegroundActivityTracker } from '@/utils/page-activity/tracker'

const CLEANUP_ALARM = 'page-activity-cleanup'

export function startPageActivityService() {
  if (chrome.extension.inIncognitoContext) return
  const store = new ActivityLogStore()
  const tracker = new ForegroundActivityTracker(store, state =>
    chrome.storage.session.set({ [ACTIVITY_SESSION_KEY]: state }),
  )
  let enabled = false
  let queue: Promise<unknown> = Promise.resolve()
  let initialized: Promise<void> | undefined
  const initialize = () =>
    (initialized ??= Promise.all([
      chrome.storage.session.get(ACTIVITY_SESSION_KEY),
      chrome.storage.local.get('settings-storage'),
    ])
      .then(([session, settings]) => {
        tracker.restore(session[ACTIVITY_SESSION_KEY])
        enabled = settings['settings-storage']?.showRecentPages !== false
      })
      .catch(error => {
        initialized = undefined
        throw error
      }))

  // Chrome can deliver activation, focus and navigation events for one action.
  // Serialize transitions and compare the real foreground page before appending anything.
  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    const task = queue.then(initialize).then(operation)
    queue = task.catch(error => console.warn('[NextTab:page-activity]', error))
    return task
  }
  const foreground = async (): Promise<chrome.tabs.Tab | null> => {
    if (!enabled) return null
    const windows = await chrome.windows.getAll({ windowTypes: ['normal', 'popup'] })
    const focused = windows.find(window => window.focused && window.state !== 'minimized')
    if (!focused?.id) return null
    const [tab] = await chrome.tabs.query({ active: true, windowId: focused.id })
    return tab ?? null
  }
  const captureTab = async (tabOrId: chrome.tabs.Tab | number): Promise<chrome.tabs.Tab | undefined> => {
    try {
      const tab = typeof tabOrId === 'number' ? await chrome.tabs.get(tabOrId) : tabOrId
      if (!tab.active) return undefined
      const window = await chrome.windows.get(tab.windowId)
      return window.focused && window.state !== 'minimized' ? tab : undefined
    } catch {
      // A tab or its window can disappear before the API resolves.
      return undefined
    }
  }
  const schedule = (
    source: ActivitySource,
    captured: Promise<chrome.tabs.Tab | null | undefined>,
    reason?: ActivityReason,
  ) => {
    const at = Date.now()
    void run(async () => {
      const tab = await captured
      if (tab !== undefined) await tracker.enter(enabled ? tab : null, at, source, reason)
    }).catch(() => {})
  }

  // Register synchronously so the event that wakes a suspended worker is delivered.
  chrome.tabs.onActivated.addListener(info => {
    // Capture the event's target before earlier log writes finish. During A → B → A,
    // that target may already be inactive when tabs.get resolves.
    const captured = Promise.all([chrome.tabs.get(info.tabId), chrome.windows.get(info.windowId)]).then(
      ([tab, window]) => (window.focused && window.state !== 'minimized' ? tab : undefined),
      () => undefined,
    )
    schedule('tab', captured)
  })
  chrome.tabs.onUpdated.addListener((_id, changes, tab) => {
    if (changes.url !== undefined || changes.title !== undefined || changes.status === 'complete')
      schedule('navigation', captureTab(tab))
  })
  chrome.tabs.onRemoved.addListener(tabId => {
    const at = Date.now()
    void run(async () => {
      if (tracker.currentTabId === tabId) await tracker.enter(null, at, 'removed')
    }).catch(() => {})
  })
  chrome.tabs.onAttached.addListener(tabId => schedule('window', captureTab(tabId), 'tab-move'))
  chrome.tabs.onReplaced.addListener(tabId => schedule('tab', captureTab(tabId), 'tab-replace'))
  chrome.windows.onFocusChanged.addListener(windowId => {
    const captured =
      windowId === chrome.windows.WINDOW_ID_NONE
        ? Promise.resolve(null)
        : chrome.tabs.query({ active: true, windowId }).then(
            ([tab]) => tab ?? null,
            () => null,
          )
    schedule('window', captured)
  })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes['settings-storage']) return
    const at = Date.now()
    void run(async () => {
      enabled = changes['settings-storage'].newValue?.showRecentPages !== false
      await tracker.enter(await foreground(), at, 'settings')
    }).catch(() => {})
  })
  chrome.history.onVisitRemoved.addListener(event => {
    const keys = event.allHistory ? undefined : new Set((event.urls ?? []).flatMap(url => normalizePageUrl(url) ?? []))
    void run(() => tracker.forget(keys)).catch(() => {})
  })
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === CLEANUP_ALARM) void run(() => store.prune(Date.now(), tracker.activeViewId)).catch(() => {})
  })
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== ACTIVITY_SNAPSHOT_MESSAGE || sender.id !== chrome.runtime.id) return
    void run(async () => {
      const now = Date.now()
      await tracker.enter(await foreground(), now, 'window', 'reconcile')
      // Incognito pages never consume or write the regular Profile's activity log.
      if (sender.tab?.incognito || message.incognito)
        return { pages: [], events: [], activeViewId: null, now, bytes: 0 }
      return store.snapshot(now, tracker.activeViewId)
    }).then(sendResponse, () => sendResponse({ error: true }))
    return true
  })
  void run(async () => {
    await store.prune(Date.now(), tracker.activeViewId)
    await tracker.enter(await foreground(), Date.now(), 'startup')
    if (!(await chrome.alarms.get(CLEANUP_ALARM))) await chrome.alarms.create(CLEANUP_ALARM, { periodInMinutes: 60 })
  }).catch(() => {})
}
