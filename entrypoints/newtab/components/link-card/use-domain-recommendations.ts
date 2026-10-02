import { useEffect, useState } from 'react'
import { getDomainFromUrl } from '@/entrypoints/newtab/lib/url'
import type { RecentPage } from '../../recent-page-recommendations'
import { getDomainRecommendations, selectDomainRecommendations } from './domain-recommendations'

export function useDomainRecommendations(
  url: string,
  contextMenuOpen: boolean,
  relatedBookmarks: chrome.bookmarks.BookmarkTreeNode[],
  relatedTabs: chrome.tabs.Tab[],
) {
  const [candidates, setCandidates] = useState<RecentPage[]>([])

  useEffect(() => {
    if (!contextMenuOpen) return
    const domain = getDomainFromUrl(url)
    if (!domain) {
      setCandidates([])
      return
    }

    let active = true
    setCandidates([])
    void getDomainRecommendations(domain)
      .then(pages => {
        if (active) setCandidates(pages)
      })
      .catch(error => {
        if (active) {
          console.warn('Could not load domain recommendations', error)
          setCandidates([])
        }
      })
    return () => {
      active = false
    }
  }, [url, contextMenuOpen])

  const excludedUrls = [
    url,
    ...relatedBookmarks.map(bookmark => bookmark.url || ''),
    ...relatedTabs.map(tab => tab.url || ''),
  ]
  return selectDomainRecommendations(candidates, excludedUrls)
}
