/**
 * Shared bookmark utilities
 */
import { getDomainFromUrl } from '@/lib/url'

/**
 * Get all top-level bookmark folders (direct children of root folders)
 */
export async function getTopLevelBookmarkFolders(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  try {
    const tree = await chrome.bookmarks.getTree()
    const folders: chrome.bookmarks.BookmarkTreeNode[] = []

    // Chrome bookmarks root has children like "Bookmarks Bar", "Other Bookmarks", etc.
    tree.forEach(root => {
      if (root.children) {
        root.children.forEach(child => {
          if (child.children) {
            // This is a folder (has children), add it to the list
            folders.push(child)
            // Also add its direct children if they are folders
            child.children.forEach(grandchild => {
              if (grandchild.children) {
                folders.push(grandchild)
              }
            })
          }
        })
      }
    })

    return folders
  } catch (error) {
    console.error('Failed to get bookmark folders:', error)
    return []
  }
}

/**
 * Check if a bookmark node is within a specific folder (including nested children)
 */
async function isBookmarkInFolder(bookmarkId: string, targetFolderId: string): Promise<boolean> {
  try {
    let currentId: string | undefined = bookmarkId

    // Traverse up the tree until we find the target folder or reach the root
    while (currentId) {
      const [node] = await chrome.bookmarks.get(currentId)
      if (!node) break

      if (node.id === targetFolderId) {
        return true
      }

      currentId = node.parentId
    }

    return false
  } catch (error) {
    console.error('Failed to check bookmark folder:', error)
    return false
  }
}

/**
 * Find bookmarks matching a domain using chrome.bookmarks.search API
 * This is more efficient than fetching the entire tree and filtering
 * @param domain The domain to search for
 * @param folderId Optional folder ID to filter bookmarks by
 */
export async function findBookmarksByDomain(
  domain: string,
  folderId?: string | null,
): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  try {
    // Use chrome.bookmarks.search() to find bookmarks containing the domain
    // This is more efficient than getTree() for large bookmark collections
    const results = await chrome.bookmarks.search({ query: domain })

    // Filter to exact domain matches
    let filteredResults = results.filter(bookmark => {
      if (!bookmark.url) return false
      const bookmarkDomain = getDomainFromUrl(bookmark.url)
      return bookmarkDomain === domain
    })

    // If a folder ID is specified, further filter to only bookmarks in that folder
    if (folderId) {
      const folderFilteredResults = await Promise.all(
        filteredResults.map(async bookmark => {
          const isInFolder = await isBookmarkInFolder(bookmark.id, folderId)
          return isInFolder ? bookmark : null
        }),
      )
      filteredResults = folderFilteredResults.filter((b): b is chrome.bookmarks.BookmarkTreeNode => b !== null)
    }

    return filteredResults
  } catch (error) {
    console.error('Failed to search bookmarks:', error)
    return []
  }
}
