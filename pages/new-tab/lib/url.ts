// export function getDefaultIconUrl(srcUrl: string): string {
//   const url = new URL(srcUrl)
//   return `${url.origin}/favicon.ico`
// }
export function getDefaultIconUrl(u: string): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'))
  url.searchParams.set('pageUrl', u)
  url.searchParams.set('size', '128')
  url.searchParams.set('timestamp', Date.now().toString())
  return url.toString()
}



/**
 * Extract domain from URL
 */
export function getDomainFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname
  } catch {
    return null
  }
}
