import { useEffect, useState } from 'react'
import { getDomainFromUrl } from '@/entrypoints/newtab/lib/url'
import { useStorage } from '@/utils'
import { settingStorage } from '@/utils/storage'

/**
 * Custom hook to fetch related open tabs when context menu opens
 */
export const useRelatedTabs = (url: string, contextMenuOpen: boolean) => {
  const [relatedTabs, setRelatedTabs] = useState<chrome.tabs.Tab[]>([])
  const settings = useStorage(settingStorage)

  useEffect(() => {
    if (!settings.showOpenTabsInQuickUrlMenu) {
      setRelatedTabs([])
      return
    }
    if (contextMenuOpen) {
      const domain = getDomainFromUrl(url)
      if (domain) {
        chrome.tabs
          .query({
            url: `*://${domain}/*`,
          })
          .then(tabs => {
            setRelatedTabs(tabs)
          })
      } else {
        // Clear tabs if domain extraction fails
        setRelatedTabs([])
      }
    }
  }, [contextMenuOpen, url, settings.showOpenTabsInQuickUrlMenu])

  return { relatedTabs, showOpenTabs: settings.showOpenTabsInQuickUrlMenu }
}
