import { afterEach, describe, expect, it, vi } from 'vitest'
import { historyResolver } from './history'
import { bookmarksResolver } from './bookmarks'
import { tabSearchResolver } from './tab-search'

vi.mock('@/utils/i18n', () => ({ t: (key: string) => key }))
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
    expect(search).toHaveBeenCalledWith({ text: '', maxResults: 10, startTime: 0 })
    expect(results?.map(item => item.title)).toEqual(['Recent page', 'https://untitled.example'])
    results?.[0].onSelect?.()
    expect(update).toHaveBeenCalledWith({ url: 'https://recent.example' })
  })

  it.each(['', '   '])('shows recently added bookmarks for a blank query %j', async query => {
    const getRecent = vi.fn().mockResolvedValue([{ id: 'saved', title: 'Saved page', url: 'https://saved.example' }])
    const search = vi.fn()
    vi.stubGlobal('chrome', { bookmarks: { getRecent, search } })
    const results = await bookmarksResolver.resolve({ query, rawQuery: query })
    expect(getRecent).toHaveBeenCalledWith(10)
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
    results?.[0].onSelect?.()
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
    expect(historySearch).toHaveBeenCalledWith({ text: 'NextTab', maxResults: 10, startTime: 0 })
    expect(bookmarkSearch).toHaveBeenCalledWith({ query: 'NextTab' })
    expect(tabSearch).toHaveBeenCalledWith({ title: '*NextTab*' })
  })
})
