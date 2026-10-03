import { useEffect, useState } from 'react'
import { queryProfileTabs } from '../services/return-pages'

export function useOpenTabs(enabled = true) {
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([])
  useEffect(() => {
    if (!enabled) {
      setTabs([])
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
        }
      } catch {
        if (!cancelled && request === revision) setTabs([])
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
    return () => {
      cancelled = true
      clearTimeout(timer)
      chrome.tabs.onCreated.removeListener(schedule)
      chrome.tabs.onRemoved.removeListener(schedule)
      chrome.tabs.onUpdated.removeListener(schedule)
    }
  }, [enabled])
  return tabs
}
