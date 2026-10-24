import { useEffect, useState } from 'react'
import { popupHost } from './popup-pages'

type SiteState = {
  current?: chrome.tabs.Tab
  tabs: chrome.tabs.Tab[]
  history: chrome.history.HistoryItem[]
  loading: boolean
  contextError: boolean
  tabsError: boolean
  historyError: boolean
}

export function usePopupSite() {
  const [reload, setReload] = useState(0)
  const [state, setState] = useState<SiteState>({
    tabs: [],
    history: [],
    loading: true,
    contextError: false,
    tabsError: false,
    historyError: false,
  })
  useEffect(() => {
    let cancelled = false
    let allDeleted = false
    const deletedHistory = new Set<string>()
    const removedTabs = new Set<number>()
    const updatedTabs = new Map<number, chrome.tabs.Tab>()
    const onRemoved = (id: number) => {
      removedTabs.add(id)
      setState(previous => ({ ...previous, tabs: previous.tabs.filter(tab => tab.id !== id) }))
    }
    const onUpdated = (id: number, _change: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      updatedTabs.set(id, tab)
      setState(previous => ({ ...previous, tabs: previous.tabs.map(item => (item.id === id ? tab : item)) }))
    }
    const onHistoryRemoved = (event: chrome.history.RemovedResult) => {
      if (event.allHistory) allDeleted = true
      for (const url of event.urls ?? []) deletedHistory.add(url)
      setState(previous => ({
        ...previous,
        history: allDeleted ? [] : previous.history.filter(item => !deletedHistory.has(item.url ?? '')),
      }))
    }
    chrome.tabs.onRemoved.addListener(onRemoved)
    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.history.onVisitRemoved.addListener(onHistoryRemoved)
    setState(previous => ({ ...previous, loading: true }))
    void (async () => {
      try {
        const [current] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (cancelled) return
        setState(previous => ({ ...previous, current, contextError: false }))
        const host = popupHost(current?.url ?? current?.pendingUrl)
        if (!host) {
          setState(previous => ({
            ...previous,
            tabs: [],
            history: [],
            loading: false,
            tabsError: false,
            historyError: false,
          }))
          return
        }
        const [tabs, history] = await Promise.allSettled([
          chrome.tabs.query({}),
          current?.incognito
            ? Promise.resolve([])
            : chrome.history.search({
                text: host,
                startTime: Date.now() - 30 * 86_400_000,
                maxResults: 1000,
              }),
        ])
        if (cancelled) return
        setState(previous => ({
          ...previous,
          tabs:
            tabs.status === 'fulfilled'
              ? tabs.value.filter(tab => !removedTabs.has(tab.id!)).map(tab => updatedTabs.get(tab.id!) ?? tab)
              : previous.tabs,
          history:
            history.status === 'fulfilled'
              ? allDeleted
                ? []
                : history.value.filter(item => !deletedHistory.has(item.url ?? ''))
              : previous.history,
          tabsError: tabs.status === 'rejected',
          historyError: history.status === 'rejected',
          loading: false,
        }))
      } catch {
        if (!cancelled) setState(previous => ({ ...previous, loading: false, contextError: true }))
      }
    })()
    return () => {
      cancelled = true
      chrome.tabs.onRemoved.removeListener(onRemoved)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      chrome.history.onVisitRemoved.removeListener(onHistoryRemoved)
    }
  }, [reload])
  return { ...state, retry: () => setReload(value => value + 1) }
}
