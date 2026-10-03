export const DAY_MS = 86_400_000
export const ACTIVITY_WINDOW_MS = 7 * DAY_MS
export const ACTIVITY_RETENTION_MS = 10 * DAY_MS
export const ACTIVITY_BYTE_BUDGET = 2 * 1024 * 1024
export const ACTIVITY_SNAPSHOT_MESSAGE = 'nexttab:page-activity-snapshot'
export const ACTIVITY_SESSION_KEY = 'page-activity-current-view'

export type ActivitySource = 'tab' | 'window' | 'navigation' | 'startup' | 'removed' | 'settings'
export type ActivityReason =
  | 'tab-switch'
  | 'window-blur'
  | 'window-focus'
  | 'window-switch'
  | 'navigation'
  | 'tab-close'
  | 'tab-move'
  | 'tab-replace'
  | 'startup'
  | 'settings-change'
  | 'reconcile'
export type ActivityPage = { id: number; key: string; url: string; title: string }
export type ActivityEvent = {
  id: number
  viewId: string
  pageId: number
  type: 'enter' | 'leave'
  at: number
  source: ActivitySource
  /** Missing on legacy records; their exact cause cannot always be reconstructed from source. */
  reason?: ActivityReason
}
export type ForegroundPage = { tabId: number; windowId: number; key: string; url: string; title: string }
export type ActiveView = ForegroundPage & { viewId: string; pageId: number; enteredAt: number }
export type ActivitySnapshot = {
  pages: ActivityPage[]
  events: ActivityEvent[]
  activeViewId: string | null
  now: number
  bytes: number
}

/** Statistics group by website and path; navigation still uses the full URL. */
export function normalizePageUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    return `${url.origin}${url.pathname}`
  } catch {
    return null
  }
}

export function isReturnablePage(value: string): boolean {
  return normalizePageUrl(value) !== null
}

export function activityDate(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
