import { afterEach, describe, expect, it, vi } from 'vitest'
import { HISTORY_SEARCH_LIMIT, loadSearchResults } from './search-results'

afterEach(() => vi.unstubAllGlobals())

describe('expanded command search', () => {
  it('queries bounded history matches instead of filtering a previously loaded time window', async () => {
    const search = vi.fn().mockResolvedValue([{ id: 'old', url: 'https://old.example/' }])
    vi.stubGlobal('chrome', { history: { search } })
    expect(await loadSearchResults('history', ' older ')).toEqual([
      { id: 'old', title: 'https://old.example/', url: 'https://old.example/' },
    ])
    expect(search).toHaveBeenCalledExactlyOnceWith({ text: 'older', startTime: 0, maxResults: HISTORY_SEARCH_LIMIT })
    search.mockRejectedValue(new Error('unavailable'))
    await expect(loadSearchResults('history', 'older')).rejects.toThrow('unavailable')
  })
  it('keeps all matching bookmark identities and URLs, excluding folders', async () => {
    const rows = Array.from({ length: 35 }, (_, id) => ({
      id: String(id),
      title: 'Saved',
      url: 'https://saved.example/?q=1#part',
    }))
    const search = vi.fn().mockResolvedValue([...rows, { id: 'folder', title: 'Folder' }])
    vi.stubGlobal('chrome', { bookmarks: { search } })
    expect(await loadSearchResults('bookmarks', ' ')).toEqual(rows)
    expect(search).toHaveBeenCalledExactlyOnceWith({ query: '' })
  })
})
