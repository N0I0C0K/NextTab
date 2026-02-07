import { useEffect, useState } from 'react'
import { findBookmarksByDomain } from '@/lib/bookmarks'
import { getDomainFromUrl } from '@/lib/url'
import { useStorage } from '@extension/shared'
import { settingStorage } from '@extension/storage'

/**
 * Custom hook to fetch related bookmarks when context menu opens
 */
export const useRelatedBookmarks = (url: string, contextMenuOpen: boolean) => {
  const [relatedBookmarks, setRelatedBookmarks] = useState<chrome.bookmarks.BookmarkTreeNode[]>([])
  const settings = useStorage(settingStorage)

  useEffect(() => {
    if (!settings.showBookmarksInQuickUrlMenu) {
      setRelatedBookmarks([])
      return
    }
    if (contextMenuOpen) {
      const domain = getDomainFromUrl(url)
      if (domain) {
        findBookmarksByDomain(domain, settings.bookmarkFolderId)
          .then(bookmarks => {
            // Filter out the current URL itself
            setRelatedBookmarks(bookmarks.filter(b => b.url !== url))
          })
          .catch(error => {
            console.error('Failed to fetch bookmarks:', error)
            setRelatedBookmarks([])
          })
      } else {
        // Clear bookmarks if domain extraction fails
        setRelatedBookmarks([])
      }
    }
  }, [contextMenuOpen, url, settings.showBookmarksInQuickUrlMenu, settings.bookmarkFolderId])

  return { relatedBookmarks, showBookmarks: settings.showBookmarksInQuickUrlMenu }
}
