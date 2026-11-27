import { describe, expect, it, vi } from 'vitest'
import { getFaviconInitial, resolveFaviconUrl } from './favicon'

describe('favicon initials', () => {
  it.each([
    ['  (Framer)', 'F'],
    ['github', 'G'],
    ['吉他练习', '吉'],
    ['123 start', '1'],
    ['—', '?'],
  ])('uses the first visible letter or number in %s', (title, expected) => {
    expect(getFaviconInitial(title)).toBe(expected)
  })

  it('recognizes Chrome’s default icon without hiding a real favicon', async () => {
    vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => `chrome-extension://test${path}` } })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (src: string) => {
        const pageUrl = new URL(src).searchParams.get('pageUrl')
        const bytes = pageUrl?.endsWith('.invalid/') ? [1, 2] : [3, 4]
        return new Response(new Uint8Array(bytes))
      }),
    )

    expect(await resolveFaviconUrl('https://missing.invalid/')).toBeNull()
    expect(await resolveFaviconUrl('https://real.example.com/')).toContain('real.example.com')
    vi.unstubAllGlobals()
  })
})

describe('Firefox favicons', () => {
  const page = 'https://site.example/deep/page?secret=1#section'
  const icon = 'https://site.example/assets/custom.png'

  function firefox(tabs: Partial<chrome.tabs.Tab>[] = [], incognito = false) {
    vi.stubGlobal('chrome', {
      runtime: { getURL: (path: string) => `moz-extension://test${path}` },
      extension: { inIncognitoContext: incognito },
      tabs: { query: vi.fn().mockResolvedValue(tabs) },
    })
    const fetch = vi.fn().mockRejectedValue(new Error('No CORS headers'))
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  it('uses an origin image without fetching cross-origin bytes or leaking the page path', async () => {
    const fetch = firefox()
    expect(await resolveFaviconUrl(page)).toBe('https://site.example/favicon.ico')
    expect(fetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('prefers the exact page tab icon and falls back after an image error', async () => {
    firefox([{ url: page, favIconUrl: icon, incognito: false }])
    expect(await resolveFaviconUrl(page)).toBe(icon)
    expect(await resolveFaviconUrl(page, [icon])).toBe('https://site.example/favicon.ico')
    expect(await resolveFaviconUrl(page, [icon, 'https://site.example/favicon.ico'])).toBeNull()
    vi.unstubAllGlobals()
  })

  it.each([false, true])('does not reuse another page or cross private boundaries (private=%s)', async incognito => {
    firefox(
      [
        { url: page, favIconUrl: icon, incognito: !incognito },
        { url: 'https://site.example/other', favIconUrl: icon, incognito },
      ],
      incognito,
    )
    expect(await resolveFaviconUrl(page)).toBe('https://site.example/favicon.ico')
    vi.unstubAllGlobals()
  })

  it.each([
    '',
    'not a url',
    'about:config',
    'file:///tmp/a',
    'javascript:alert(1)',
    'https://user:pass@site.example/a',
  ])('does not request an origin icon for %s', async url => {
    const fetch = firefox()
    expect(await resolveFaviconUrl(url)).toBeNull()
    expect(chrome.tabs.query).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('shares simultaneous tab lookups without retaining stale results', async () => {
    firefox([{ url: page, favIconUrl: icon }])
    await Promise.all([resolveFaviconUrl(page), resolveFaviconUrl(page)])
    expect(chrome.tabs.query).toHaveBeenCalledTimes(1)
    vi.mocked(chrome.tabs.query).mockResolvedValue([])
    expect(await resolveFaviconUrl(page)).toBe('https://site.example/favicon.ico')
    vi.unstubAllGlobals()
  })

  it('still tries the origin when querying tabs fails', async () => {
    firefox()
    vi.mocked(chrome.tabs.query).mockRejectedValue(new Error('Tab query failed'))
    expect(await resolveFaviconUrl(page)).toBe('https://site.example/favicon.ico')
    vi.unstubAllGlobals()
  })
})
