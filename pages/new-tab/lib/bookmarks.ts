/**
 * Shared bookmark utilities
 */
import { getDomainFromUrl } from '@/lib/url'

/**
 * Get bookmark folders for display in settings
 * Returns root folders (Bookmarks Bar, Other Bookmarks) and their direct children
 */
export async function getBookmarkFolders(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
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
 * Get all bookmark IDs within a folder (including nested children)
 * More efficient than checking each bookmark individually
 */
async function getBookmarkIdsInFolder(folderId: string): Promise<Set<string>> {
  try {
    const [subtree] = await chrome.bookmarks.getSubTree(folderId)
    const ids = new Set<string>()

    const collectIds = (node: chrome.bookmarks.BookmarkTreeNode) => {
      ids.add(node.id)
      if (node.children) {
        node.children.forEach(collectIds)
      }
    }

    collectIds(subtree)
    return ids
  } catch (error) {
    console.error('Failed to get folder subtree:', error)
    return new Set()
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
      // Get all bookmark IDs within the folder once (more efficient than per-bookmark checks)
      const folderBookmarkIds = await getBookmarkIdsInFolder(folderId)
      filteredResults = filteredResults.filter(bookmark => folderBookmarkIds.has(bookmark.id))
    }

    return filteredResults
  } catch (error) {
    console.error('Failed to search bookmarks:', error)
    return []
  }
}
