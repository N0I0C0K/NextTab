import { getDefaultIconUrl, isFirefoxExtension } from './url'

const MISSING_FAVICON_PAGE = 'https://nexttab-missing-favicon.invalid/'

let defaultFaviconBytes: Promise<Uint8Array> | undefined

async function readFaviconBytes(src: string): Promise<Uint8Array> {
  const response = await fetch(src)
  if (!response.ok) throw new Error(`Favicon request failed: ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

function matchesDefaultFavicon(bytes: Uint8Array, fallback: Uint8Array): boolean {
  return bytes.length === fallback.length && bytes.every((value, index) => value === fallback[index])
}

let pendingTabs: Promise<chrome.tabs.Tab[]> | undefined

function getFirefoxTabs(): Promise<chrome.tabs.Tab[]> {
  // Share simultaneous lookups, but do not persist private URLs or stale tab icons.
  pendingTabs ??= chrome.tabs.query({}).finally(() => {
    pendingTabs = undefined
  })
  return pendingTabs
}

/** Chrome returns a successful image response even when a site has no favicon. */
export async function resolveFaviconUrl(
  pageUrl: string,
  failedSources: readonly string[] = [],
): Promise<string | null> {
  const src = getDefaultIconUrl(pageUrl)
  if (isFirefoxExtension()) {
    if (!src) return null
    try {
      const tabs = await getFirefoxTabs()
      const tabIcon = tabs.find(
        tab =>
          tab.url === new URL(pageUrl).href &&
          Boolean(tab.incognito) === Boolean(chrome.extension?.inIncognitoContext) &&
          tab.favIconUrl &&
          !failedSources.includes(tab.favIconUrl),
      )?.favIconUrl
      if (tabIcon) return tabIcon
    } catch {
      // A tab lookup failure must not prevent the origin favicon from loading.
    }
    // Load remote images through <img>, not fetch: image embedding needs neither
    // CORS response headers nor broad host permissions. No third-party proxy.
    return failedSources.includes(src) ? null : src
  }
  if (failedSources.includes(src)) return null
  let bytes: Uint8Array
  try {
    bytes = await readFaviconBytes(src)
  } catch {
    return null
  }

  try {
    defaultFaviconBytes ??= readFaviconBytes(getDefaultIconUrl(MISSING_FAVICON_PAGE))
    return matchesDefaultFavicon(bytes, await defaultFaviconBytes) ? null : src
  } catch {
    // If the reference image is unavailable, keep the favicon we did load.
    return src
  }
}

export function getFaviconInitial(title: string): string {
  const firstLetter = title.match(/[\p{L}\p{N}]/u)?.[0]
  return firstLetter ? Array.from(firstLetter.toLocaleUpperCase())[0] : '?'
}
