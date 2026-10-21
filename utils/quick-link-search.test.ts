import { afterEach, describe, expect, it, vi } from 'vitest'
import { matchesSearch, openSavedUrl, searchQuickLinks } from './quick-link-search'

describe('quick-link search', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('ranks exact titles, prefixes, title words then URL matches without changing saved order', () => {
    const items = [
      { id: 'url', title: 'Project', url: 'https://github.com/' },
      { id: 'inside', title: 'My GitHub account', url: 'https://example.com/one' },
      { id: 'prefix', title: 'GitHub Issues', url: 'https://example.com/two' },
      { id: 'exact', title: 'GitHub', url: 'https://example.com/three' },
    ]
    expect(searchQuickLinks(items, ' GiTHub ').map(item => item.id)).toEqual(['exact', 'prefix', 'inside', 'url'])
    expect(items[0].id).toBe('url')
    expect(searchQuickLinks(items, '')).toEqual(items)
  })
  it('searches every record, keeps query variants independent, and matches all terms across fields', () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      id: String(index),
      title: 'Saved project',
      url: `https://example.com/project?q=${index}`,
    }))
    expect(searchQuickLinks(items, 'project q=99').map(item => item.id)).toEqual(['99'])
    expect(searchQuickLinks(items, 'project')).toHaveLength(100)
    expect(matchesSearch('saved missing', 'Saved project', 'https://example.com')).toBe(false)
  })
  it('opens the original saved URL, including browser pages, using exactly one requested destination', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const create = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('chrome', { tabs: { update, create } })
    await openSavedUrl('chrome://bookmarks/')
    expect(update).toHaveBeenCalledExactlyOnceWith({ url: 'chrome://bookmarks/' })
    await openSavedUrl('https://example.com/?q=a%20b#detail', true)
    expect(create).toHaveBeenCalledExactlyOnceWith({ url: 'https://example.com/?q=a%20b#detail', active: true })
    expect(update).toHaveBeenCalledTimes(1)
    await expect(openSavedUrl('not a URL')).rejects.toThrow()
    expect(create).toHaveBeenCalledTimes(1)
  })
})
