import { useEffect, useState } from 'react'
import { queryProfileTabs } from '../services/return-pages'

export function useProfileTabsState(enabled = true) {
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([])
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!enabled) {
      setLoaded(false)
      setTabs(previous => (previous.length ? [] : previous))
      return
    }
    let cancelled = false
    let revision = 0
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      const request = ++revision
      try {
        const items = await queryProfileTabs()
        if (!cancelled && request === revision) {
          setTabs(items)
          setLoaded(true)
          setError(false)
        }
      } catch {
        if (!cancelled && request === revision) setError(true)
      }
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void refresh(), 100)
    }
    void refresh()
    chrome.tabs.onCreated.addListener(schedule)
    chrome.tabs.onRemoved.addListener(schedule)
    chrome.tabs.onUpdated.addListener(schedule)
    chrome.tabs.onMoved.addListener(schedule)
    chrome.tabs.onAttached.addListener(schedule)
    chrome.tabs.onDetached.addListener(schedule)
    chrome.tabs.onReplaced.addListener(schedule)
    return () => {
      cancelled = true
      clearTimeout(timer)
      chrome.tabs.onCreated.removeListener(schedule)
      chrome.tabs.onRemoved.removeListener(schedule)
      chrome.tabs.onUpdated.removeListener(schedule)
      chrome.tabs.onMoved.removeListener(schedule)
      chrome.tabs.onAttached.removeListener(schedule)
      chrome.tabs.onDetached.removeListener(schedule)
      chrome.tabs.onReplaced.removeListener(schedule)
    }
  }, [enabled, reload])
  return { tabs, error, loading: enabled && !loaded, retry: () => setReload(value => value + 1) }
}

export function useOpenTabs(enabled = true) {
  return useProfileTabsState(enabled).tabs
}
