/**
 * Get default icon URL for a page
 * @param pageUrl - The URL of the page
 * @returns The URL to fetch the favicon
 */
export function getDefaultIconUrl(pageUrl: string): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'))
  url.searchParams.set('pageUrl', pageUrl)
  url.searchParams.set('size', '128')
  url.searchParams.set('timestamp', Date.now().toString())
  return url.toString()
}

/**
 * Extract domain from URL
 * @param url - The URL to extract domain from
 * @returns The hostname or null if invalid
 */
export function getDomainFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname
  } catch {
    return null
  }
}
