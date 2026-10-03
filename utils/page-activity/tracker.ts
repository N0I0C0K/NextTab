import {
  isReturnablePage,
  normalizePageUrl,
  type ActivityReason,
  type ActivitySource,
  type ActiveView,
  type ForegroundPage,
} from './model'
import type { ActivityLogStore } from './store'

type SessionState = { current: ActiveView | null }

/** Session state survives worker suspension, but is discarded when the browser restarts. */
export class ForegroundActivityTracker {
  private current: ActiveView | null = null

  constructor(
    readonly store: ActivityLogStore,
    private save: (state: SessionState) => Promise<void>,
  ) {}

  restore(state?: SessionState) {
    this.current = state?.current ?? null
  }

  get activeViewId() {
    return this.current?.viewId ?? null
  }

  get currentTabId() {
    return this.current?.tabId
  }

  async enter(tab: chrome.tabs.Tab | null, at: number, source: ActivitySource, reason?: ActivityReason) {
    let next: ForegroundPage | null = null
    // URL may be unknown on activation; onUpdated will supply it later.
    if (
      tab &&
      !tab.incognito &&
      tab.id !== undefined &&
      tab.url &&
      tab.url.length <= 8192 &&
      isReturnablePage(tab.url)
    ) {
      next = {
        tabId: tab.id,
        windowId: tab.windowId,
        key: normalizePageUrl(tab.url)!,
        url: tab.url,
        title: tab.title ?? '',
      }
    }
    const previous = this.current
    at = Math.max(at, previous?.enteredAt ?? at)
    if (!previous && !next) return
    if (
      previous &&
      next &&
      previous.tabId === next.tabId &&
      previous.windowId === next.windowId &&
      previous.key === next.key
    ) {
      if (previous.url !== next.url || previous.title !== next.title) {
        await this.store.updatePage(next, at, previous.viewId)
        this.current = { ...previous, ...next }
        await this.save({ current: this.current })
      }
      return
    }
    this.current = await this.store.transition(previous, next, at, source, reason)
    await this.save({ current: this.current })
  }

  async forget(keys?: Set<string>) {
    await this.store.forget(keys)
    if (this.current && (!keys || keys.has(this.current.key))) {
      this.current = null
      await this.save({ current: null })
    }
  }
}
