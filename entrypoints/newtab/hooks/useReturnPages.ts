import { useEffect, useState } from 'react'
import { fetchReturnPages, normalizePageUrl, type ReturnPage, type ReturnPageSource } from '../services/return-pages'

export function useReturnPages(source: ReturnPageSource) {
  const [state, setState] = useState<{
    source: ReturnPageSource
    pages: ReturnPage[]
    loading: boolean
    refreshing: boolean
    error: boolean
  }>({
    source,
    pages: [],
    loading: true,
    refreshing: false,
    error: false,
  })
  useEffect(() => {
    let controller: AbortController | undefined
    let timer: number | undefined
    let disposed = false
    let needsRefresh = document.visibilityState !== 'visible'
    const currentTab = chrome.tabs.getCurrent().catch(() => undefined)
    const cancelScheduled = () => {
      window.clearTimeout(timer)
      timer = undefined
    }
    const load = (background: boolean) => {
      controller?.abort()
      const request = new AbortController()
      controller = request
      setState(previous =>
        background && previous.source === source && !previous.loading
          ? { ...previous, refreshing: true }
          : { source, pages: [], loading: true, refreshing: false, error: false },
      )
      void fetchReturnPages(source, request.signal).then(
        pages => {
          if (!request.signal.aborted) setState({ source, pages, loading: false, refreshing: false, error: false })
        },
        () => {
          if (!request.signal.aborted)
            setState(previous => ({
              source,
              pages: background && previous.source === source ? previous.pages : [],
              loading: false,
              refreshing: false,
              error: true,
            }))
        },
      )
    }
    const returnToPage = () => {
      if (document.visibilityState !== 'visible') return
      needsRefresh = false
      cancelScheduled()
      // Activation commonly delivers visibility and focus together. Query the completed
      // foreground log once, and retain the current list until the replacement is ready.
      timer = window.setTimeout(() => {
        timer = undefined
        if (document.visibilityState === 'visible') load(true)
      }, 75)
    }
    const leavePage = () => {
      needsRefresh = true
      cancelScheduled()
      controller?.abort()
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') leavePage()
      else if (needsRefresh) returnToPage()
    }
    const onFocus = () => {
      if (needsRefresh) returnToPage()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) returnToPage()
    }
    const checkForegroundReturn = async (tab: chrome.tabs.Tab) => {
      try {
        const [window, [active]] = await Promise.all([
          chrome.windows.get(tab.windowId),
          chrome.tabs.query({ active: true, windowId: tab.windowId }),
        ])
        if (!disposed && window.focused && active?.id === tab.id && needsRefresh) returnToPage()
      } catch {
        // A closing window is not a return to this page; DOM events remain a fallback.
      }
    }
    const onTabActivated = (event: chrome.tabs.TabActiveInfo) => {
      void currentTab.then(tab => {
        if (disposed || !tab || event.windowId !== tab.windowId) return
        if (event.tabId !== tab.id) leavePage()
        else void checkForegroundReturn(tab)
      })
    }
    const onWindowFocus = (windowId: number) => {
      void currentTab.then(tab => {
        if (disposed || !tab) return
        if (windowId !== tab.windowId) leavePage()
        else void checkForegroundReturn(tab)
      })
    }
    load(false)
    // Re-rank at page entry, not while the user is browsing the current list.
    // Deletions must still remove data immediately and cancel stale pending results.
    const onRemoved = (event: chrome.history.RemovedResult) => {
      cancelScheduled()
      controller?.abort()
      const removed = new Set((event.urls ?? []).map(normalizePageUrl))
      setState(previous => ({
        source,
        pages: event.allHistory ? [] : previous.pages.filter(page => !removed.has(normalizePageUrl(page.url))),
        loading: false,
        refreshing: false,
        error: false,
      }))
    }
    chrome.history.onVisitRemoved.addListener(onRemoved)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', leavePage)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
    chrome.tabs.onActivated.addListener(onTabActivated)
    chrome.windows.onFocusChanged.addListener(onWindowFocus)
    return () => {
      disposed = true
      cancelScheduled()
      controller?.abort()
      chrome.history.onVisitRemoved.removeListener(onRemoved)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', leavePage)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onPageShow)
      chrome.tabs.onActivated.removeListener(onTabActivated)
      chrome.windows.onFocusChanged.removeListener(onWindowFocus)
    }
  }, [source])
  // Effects run after paint. Mark a newly selected source as pending in the same render,
  // so the old source never flashes with the new tab's labels.
  return state.source === source ? state : { source, pages: [], loading: true, refreshing: false, error: false }
}
