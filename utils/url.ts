/**
 * Get default icon URL for a page
 * @param pageUrl - The URL of the page
 * @returns The URL to fetch the favicon
 */
export function isFirefoxExtension(): boolean {
  return chrome.runtime.getURL('/').startsWith('moz-extension:')
}

export function getDefaultIconUrl(pageUrl: string): string {
  // Firefox does not implement Chromium's extension /_favicon/ endpoint.
  if (isFirefoxExtension()) {
    try {
      const page = new URL(pageUrl)
      if (!['http:', 'https:'].includes(page.protocol) || page.username || page.password) return ''
      return `${page.origin}/favicon.ico`
    } catch {
      return ''
    }
  }
  const url = new URL(chrome.runtime.getURL('/_favicon/'))
  url.searchParams.set('pageUrl', pageUrl)
  url.searchParams.set('size', '128')
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
