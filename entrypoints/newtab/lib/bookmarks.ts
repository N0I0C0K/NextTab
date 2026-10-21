/**
 * Shared bookmark utilities
 */
import { getDomainFromUrl } from '@/entrypoints/newtab/lib/url'

/**
 * Get bookmark folders for display in settings
 * Returns root folders (Bookmarks Bar, Other Bookmarks) and their direct children
 */
export async function getBookmarkFolders(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  try {
    // Fetch only the immediate children of the bookmarks root ("0")
    const rootFolders = await chrome.bookmarks.getChildren('0')
    const folders: chrome.bookmarks.BookmarkTreeNode[] = []

    // Root folders like "Bookmarks Bar", "Other Bookmarks", etc., and their direct child folders
    for (const root of rootFolders) {
      // Folders have no URL; bookmarks have a URL
      if (!root.url) {
        folders.push(root)

        try {
          const children = await chrome.bookmarks.getChildren(root.id)
          children.forEach(child => {
            if (!child.url) {
              folders.push(child)
            }
          })
        } catch (childError) {
          console.error('Failed to get children for bookmark folder (continuing):', root.id, childError)
        }
      }
    }

    return folders
  } catch (error) {
    console.error('Failed to get bookmark folders:', error)
    return []
  }
}

export type SiteBookmark = chrome.bookmarks.BookmarkTreeNode & { folderPath: string }

/** Traverse the complete selected subtree in bookmark order, preserving individual records. */
export function collectSiteBookmarks(
  tree: chrome.bookmarks.BookmarkTreeNode[],
  domain: string,
  folderId?: string | null,
): SiteBookmark[] {
  const result: SiteBookmark[] = []
  const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[], path: string[], inside: boolean) => {
    for (const node of nodes) {
      const included = inside || !folderId || node.id === folderId
      if (node.url && included && getDomainFromUrl(node.url) === domain)
        result.push({ ...node, folderPath: path.join(' / ') })
      if (node.children) walk(node.children, node.title ? [...path, node.title] : path, included)
    }
  }
  walk(tree, [], false)
  return result
}

/**
 * Find exact-host bookmarks in the complete tree; a missing folder produces no matches.
 * @param domain The domain to search for
 * @param folderId Optional folder ID to filter bookmarks by
 */
export async function findBookmarksByDomain(domain: string, folderId?: string | null): Promise<SiteBookmark[]> {
  return collectSiteBookmarks(await chrome.bookmarks.getTree(), domain, folderId)
}
