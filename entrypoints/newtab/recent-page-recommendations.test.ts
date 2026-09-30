import { describe, expect, it } from 'vitest'
import { pageIdentity, rankRecentPages, selectRecentPages } from './recent-page-recommendations'

const noon = (day: number) => new Date(2026, 8, day, 12).getTime()

describe('recent page recommendations', () => {
  it('ranks by distinct visit days and excludes one-off and transient URLs', () => {
    const pages = rankRecentPages(
      [
        {
          url: 'https://docs.example.com/project/guide',
          title: 'Project guide',
          visits: [noon(25), noon(25), noon(26)],
        },
        {
          url: 'https://code.example.com/team/merge/42',
          title: 'Merge request 42',
          visits: [noon(24), noon(25), noon(26)],
        },
        { url: 'https://docs.example.com/project/once', title: 'One-off page', visits: [noon(26)] },
        { url: 'https://docs.example.com/search?q=secret', title: 'Search results', visits: [noon(24), noon(25)] },
      ],
      noon(28),
    )
    expect(pages.map(page => page.title)).toEqual(['Merge request 42', 'Project guide'])
    expect(pages[1].days28).toBe(2)
    expect(pageIdentity('https://docs.example.com/oauth/callback')).toBeNull()
  })

  it('suppresses pinned pages and limits each host to two cards', () => {
    const pages = rankRecentPages(
      ['/a', '/b', '/c', '/d'].map((path, index) => ({
        url: `https://${index === 3 ? 'other' : 'docs'}.example.com${path}`,
        title: `Page ${path}`,
        visits: [noon(23), noon(24), noon(25), noon(26)].slice(Math.min(index, 2)),
      })),
      noon(28),
    )
    expect(selectRecentPages(pages, ['https://docs.example.com/a'])).toEqual([
      expect.objectContaining({ url: 'https://docs.example.com/b' }),
      expect.objectContaining({ url: 'https://docs.example.com/c' }),
      expect.objectContaining({ url: 'https://other.example.com/d' }),
    ])
    expect(selectRecentPages(pages, ['https://docs.example.com/a'], 6, 1).map(page => page.url)).toEqual([
      'https://docs.example.com/b',
      'https://other.example.com/d',
    ])
  })
})
