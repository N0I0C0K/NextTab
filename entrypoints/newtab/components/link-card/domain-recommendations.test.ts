import { describe, expect, it } from 'vitest'
import { rankDomainRecommendations, selectDomainRecommendations } from './domain-recommendations'

const noon = (day: number) => new Date(2026, 8, day, 12).getTime()

describe('domain recommendations', () => {
  it('favors pages visited repeatedly this week and ignores repeated visits on the same day', () => {
    const pages = rankDomainRecommendations(
      [
        {
          url: 'https://code.example.com/project/recent',
          title: 'Recent project',
          visits: [noon(23), noon(27), noon(28), noon(28), noon(28)],
        },
        {
          url: 'https://code.example.com/project/older',
          title: 'Older project',
          visits: [noon(2), noon(4), noon(6), noon(8), noon(10), noon(12)],
        },
        {
          url: 'https://code.example.com/project/one-off',
          title: 'One-off project',
          visits: [noon(28), noon(28), noon(28)],
        },
      ],
      noon(29),
    )

    expect(pages.map(page => page.title)).toEqual(['Recent project', 'Older project'])
    expect(pages[0]).toMatchObject({ days28: 3, days7: 3 })
  })

  it('omits the quick link and pages already present as bookmarks or tabs before limiting to two', () => {
    const pages = rankDomainRecommendations(
      ['/current', '/bookmarked', '/open', '/recommend-1', '/recommend-2', '/recommend-3'].map((path, index) => ({
        url: `https://code.example.com${path}`,
        title: `Page ${index}`,
        visits: [noon(26), noon(27), noon(28)],
      })),
      noon(29),
    )

    expect(
      selectDomainRecommendations(
        [...pages.slice(0, 4), { ...pages[3], url: 'https://www.code.example.com/recommend-1' }, ...pages.slice(4)],
        [
          'https://code.example.com/current',
          'https://www.code.example.com/bookmarked?view=recent',
          'https://code.example.com/open#discussion',
        ],
      ).map(page => page.url),
    ).toEqual(['https://code.example.com/recommend-1', 'https://code.example.com/recommend-2'])
  })
})
