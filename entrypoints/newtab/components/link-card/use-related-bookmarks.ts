import { useEffect, useState } from 'react'
import { findBookmarksByDomain } from '@/entrypoints/newtab/lib/bookmarks'
import { getDomainFromUrl } from '@/entrypoints/newtab/lib/url'
import { useStorage } from '@/utils'
import { settingStorage } from '@/utils/storage'

/**
 * Custom hook to fetch related bookmarks when context menu opens
 */
export const useRelatedBookmarks = (url: string, contextMenuOpen: boolean) => {
  const [relatedBookmarks, setRelatedBookmarks] = useState<chrome.bookmarks.BookmarkTreeNode[]>([])
  const [error, setError] = useState(false)
  const [loadedScope, setLoadedScope] = useState('')
  const settings = useStorage(settingStorage)
  const scope = getDomainFromUrl(url) + ':' + (settings.bookmarkFolderId ?? '')

  useEffect(() => {
    let cancelled = false
    if (!settings.showBookmarksInQuickUrlMenu) {
      setRelatedBookmarks([])
      return
    }
    if (contextMenuOpen) {
      setError(false)
      const domain = getDomainFromUrl(url)
      if (domain) {
        findBookmarksByDomain(domain, settings.bookmarkFolderId)
          .then(bookmarks => {
            if (!cancelled) {
              setRelatedBookmarks(bookmarks)
              setLoadedScope(scope)
            }
          })
          .catch(error => {
            console.error('Failed to fetch bookmarks:', error)
            if (!cancelled) setError(true)
          })
      } else {
        // Clear bookmarks if domain extraction fails
        setRelatedBookmarks([])
      }
    }
    return () => {
      cancelled = true
    }
  }, [contextMenuOpen, url, settings.showBookmarksInQuickUrlMenu, settings.bookmarkFolderId, scope])

  return {
    relatedBookmarks: loadedScope === scope ? relatedBookmarks : [],
    bookmarkError: error,
    showBookmarks: settings.showBookmarksInQuickUrlMenu,
  }
}
