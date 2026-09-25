import { getDefaultIconUrl } from './url'

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

/** Chrome returns a successful image response even when a site has no favicon. */
export async function resolveFaviconUrl(pageUrl: string): Promise<string | null> {
  const src = getDefaultIconUrl(pageUrl)
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
