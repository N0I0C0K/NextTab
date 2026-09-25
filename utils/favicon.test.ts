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
