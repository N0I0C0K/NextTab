import { afterEach, describe, expect, it, vi } from 'vitest'
import { historyResolver } from './history'
import { bookmarksResolver } from './bookmarks'
import { tabSearchResolver } from './tab-search'

vi.mock('@/utils/i18n', () => ({
  t: (key: string, substitutions?: string[]) => [key, ...(substitutions ?? [])].join(':'),
}))
vi.mock('@/entrypoints/newtab/lib/url', () => ({ getDefaultIconUrl: (url: string) => url }))

afterEach(() => vi.unstubAllGlobals())

describe('command plugin default results', () => {
  it.each(['', '   '])('shows recent history for a blank query %j, including visits older than a day', async query => {
    const search = vi.fn().mockResolvedValue([
      { id: 'recent', title: 'Recent page', url: 'https://recent.example', lastVisitTime: Date.now() - 172800000 },
      { id: 'untitled', url: 'https://untitled.example', lastVisitTime: Date.now() - 259200000 },
    ])
    const update = vi.fn()
    vi.stubGlobal('chrome', { history: { search }, tabs: { update } })
    const results = await historyResolver.resolve({ query, rawQuery: query })
    expect(search).toHaveBeenCalledWith({ text: '', maxResults: 11, startTime: 0 })
    expect(results?.map(item => item.title)).toEqual(['Recent page', 'https://untitled.example'])
    await results?.[0].onSelect?.()
    expect(update).toHaveBeenCalledWith({ url: 'https://recent.example' })
  })

  it.each(['', '   '])('shows recently added bookmarks for a blank query %j', async query => {
    const getRecent = vi.fn().mockResolvedValue([{ id: 'saved', title: 'Saved page', url: 'https://saved.example' }])
    const search = vi.fn()
    vi.stubGlobal('chrome', { bookmarks: { getRecent, search } })
    const results = await bookmarksResolver.resolve({ query, rawQuery: query })
    expect(getRecent).toHaveBeenCalledWith(11)
    expect(search).not.toHaveBeenCalled()
    expect(results?.[0].title).toBe('Saved page')
  })

  it.each(['', '   '])('shows open tabs for a blank query %j and keeps their switch action', async query => {
    const search = vi.fn().mockResolvedValue([{ id: 42, windowId: 7, title: 'Open page', url: 'https://open.example' }])
    const updateTab = vi.fn()
    const updateWindow = vi.fn()
    vi.stubGlobal('chrome', { tabs: { query: search, update: updateTab }, windows: { update: updateWindow } })
    const results = await tabSearchResolver.resolve({ query, rawQuery: query })
    expect(search).toHaveBeenCalledWith({})
    expect(results?.[0].title).toBe('Open page')
    await results?.[0].onSelect?.()
    expect(updateWindow).toHaveBeenCalledWith(7, { focused: true })
    expect(updateTab).toHaveBeenCalledWith(42, { active: true })
  })

  it('keeps nonempty searches filtered and handles empty data', async () => {
    const historySearch = vi.fn().mockResolvedValue([])
    const bookmarkSearch = vi.fn().mockResolvedValue([])
    const tabSearch = vi.fn().mockResolvedValue([])
    vi.stubGlobal('chrome', {
      history: { search: historySearch },
      bookmarks: { search: bookmarkSearch },
      tabs: { query: tabSearch },
    })
    const params = { query: ' NextTab ', rawQuery: ' NextTab ' }
    expect(await historyResolver.resolve(params)).toBeNull()
    expect(await bookmarksResolver.resolve(params)).toBeNull()
    expect(await tabSearchResolver.resolve(params)).toBeNull()
    expect(historySearch).toHaveBeenCalledWith({ text: 'NextTab', maxResults: 11, startTime: 0 })
    expect(bookmarkSearch).toHaveBeenCalledWith({ query: 'NextTab' })
    expect(tabSearch).toHaveBeenCalledWith({})
  })
})

describe('search result actions and continuation', () => {
  it.each([historyResolver, bookmarksResolver])(
    'propagates rejected navigation and supports modifier opening for $properties.name',
    async resolver => {
      const row = { id: 'one', title: 'Saved page', url: 'https://saved.example/' }
      const update = vi.fn().mockRejectedValue(new Error('unavailable'))
      const create = vi.fn().mockResolvedValue({})
      vi.stubGlobal('chrome', {
        history: { search: vi.fn().mockResolvedValue([row]) },
        bookmarks: { search: vi.fn().mockResolvedValue([row]) },
        tabs: { update, create },
      })
      const result = (await resolver.resolve({ query: 'saved', rawQuery: 'saved' }))![0]
      expect(result.supportsNewTab).toBe(true)
      await expect(result.onSelect?.()).rejects.toThrow('unavailable')
      await result.onSelect?.({ newTab: true })
      expect(create).toHaveBeenCalledExactlyOnceWith({ url: row.url, active: true })
      update.mockResolvedValue({})
      await expect(result.onSelect?.()).resolves.toBeUndefined()
    },
  )

  it('awaits both tab activation and window focus, propagating either failure', async () => {
    const update = vi.fn().mockRejectedValue(new Error('tab closed'))
    const focus = vi.fn().mockResolvedValue({})
    const create = vi.fn().mockResolvedValue({})
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 5, windowId: 2, title: 'Tab', url: 'https://tab.example/' }]),
        update,
        create,
      },
      windows: { update: focus },
    })
    const result = (await tabSearchResolver.resolve({ query: '', rawQuery: '' }))![0]
    await expect(result.onSelect?.()).rejects.toThrow('tab closed')
    expect(focus).not.toHaveBeenCalled()
    update.mockResolvedValue({})
    focus.mockRejectedValue(new Error('window closed'))
    await expect(result.onSelect?.()).rejects.toThrow('window closed')
    focus.mockResolvedValue({})
    await expect(result.onSelect?.()).resolves.toBeUndefined()
    await result.onSelect?.({ newTab: true })
    expect(create).toHaveBeenCalledExactlyOnceWith({ url: 'https://tab.example/', active: true })
  })

  it('matches title and URL terms case-insensitively while preserving duplicates and privacy boundaries', async () => {
    const tabs = [
      { id: 1, title: 'Project', url: 'https://docs.example/unique?x=1', incognito: false },
      { id: 2, title: 'Project', url: 'https://docs.example/unique?x=1', incognito: false },
      { id: 3, title: 'Project', url: 'https://docs.example/unique?x=1', incognito: true },
      { id: 4, title: 'Project', url: 'https://other.example/', incognito: false },
      { id: 5, title: 'Project', pendingUrl: 'https://docs.example/unique?x=2', incognito: false },
    ]
    const query = vi.fn().mockResolvedValue(tabs)
    vi.stubGlobal('chrome', { tabs: { query }, extension: { inIncognitoContext: false } })
    const params = { query: '  PROJECT  UNIQUE ', rawQuery: '' }
    expect((await tabSearchResolver.resolve(params))?.map(row => row.id)).toEqual(['1', '2', '5'])
    chrome.extension.inIncognitoContext = true
    expect((await tabSearchResolver.resolve(params))?.map(row => row.id)).toEqual(['3'])
    expect(query).toHaveBeenCalledTimes(2)
  })

  it.each([historyResolver, bookmarksResolver])(
    'offers continuation only beyond ten results for $properties.name',
    async resolver => {
      const rows = Array.from({ length: 11 }, (_, id) => ({
        id: String(id),
        title: 'Match',
        url: `https://match.example/${id}`,
      }))
      const search = vi.fn().mockResolvedValue(rows)
      const openSearchResults = vi.fn()
      vi.stubGlobal('chrome', { history: { search }, bookmarks: { search } })
      const params = { query: 'Match', rawQuery: 'Match', openSearchResults }
      const results = (await resolver.resolve(params))!
      expect(results).toHaveLength(11)
      expect(results[10].id).toBe(`${resolver.properties.name}-more`)
      expect(results[10].groupAction).toBe(true)
      expect(results[10].supportsNewTab).not.toBe(true)
      expect(results.filter(item => !item.groupAction)).toHaveLength(10)
      await results[10].onSelect?.()
      expect(openSearchResults).toHaveBeenCalledWith(resolver.properties.name, 'Match')
      search.mockResolvedValue(rows.slice(0, 10))
      expect(await resolver.resolve(params)).toHaveLength(10)
    },
  )
})

describe('duplicate tab location cues', () => {
  it('labels only identical title/URL pairs using scoped windows and current positions', async () => {
    const tabs = [
      { id: 1, title: 'Shared', url: 'https://docs.example/a', windowId: 20, index: 3 },
      { id: 2, title: 'Shared', url: 'https://docs.example/a', windowId: 40, index: 0 },
      { id: 3, title: 'Shared', url: 'https://docs.example/b', windowId: 20, index: 4 },
      { id: 4, title: 'Different title', url: 'https://docs.example/a', windowId: 40, index: 1 },
      { id: 5, title: 'Private only', url: 'https://private.example/', windowId: 10, index: 0, incognito: true },
      { id: 6, title: 'Private only', url: 'https://private.example/', windowId: 20, index: 5 },
    ]
    const query = vi.fn().mockResolvedValue(tabs)
    vi.stubGlobal('chrome', { tabs: { query }, extension: { inIncognitoContext: false } })
    const params = { query: '', rawQuery: '' }
    const results = (await tabSearchResolver.resolve(params))!
    expect(results.map(row => row.id)).toEqual(['1', '2', '3', '4', '6'])
    expect(results[0].description).toBe('commandTabLocation:1:4 · https://docs.example/a')
    expect(results[1].description).toBe('commandTabLocation:2:1 · https://docs.example/a')
    expect(results.slice(2).map(row => row.description)).toEqual([
      'https://docs.example/b',
      'https://docs.example/a',
      'https://private.example/',
    ])
    tabs[0].windowId = 40
    tabs[0].index = 6
    const updated = (await tabSearchResolver.resolve(params))!
    expect(updated[0].description).toBe('commandTabLocation:2:7 · https://docs.example/a')
    expect(query).toHaveBeenCalledTimes(2)
  })
})
