import { describe, expect, it } from 'vitest'
import { buildHistorySuggestions } from './impl/historySuggestStorage'

const historyItem = (id: string, url: string | undefined, visitCount: number): chrome.history.HistoryItem => ({
  id,
  url,
  title: id.toUpperCase(),
  visitCount,
})

describe('history suggestions', () => {
  it('sorts by visits, deduplicates hosts, and excludes quick-link hosts', () => {
    const suggestions = buildHistorySuggestions(
      [{ id: 'known', title: 'Known', url: 'https://known.example.com/start' }],
      [
        historyItem('low', 'https://low.example.com/', 2),
        historyItem('known-history', 'https://known.example.com/other', 100),
        historyItem('high', 'https://high.example.com/first', 20),
        historyItem('high-duplicate', 'https://high.example.com/second', 10),
      ],
    )

    expect(suggestions.map(item => item.id)).toEqual(['high', 'low'])
  })

  it('ignores malformed and missing URLs instead of aborting the refresh', () => {
    const suggestions = buildHistorySuggestions(
      [{ id: 'invalid', title: 'Invalid', url: 'not a URL' }],
      [
        historyItem('invalid-history', 'also not a URL', 100),
        historyItem('missing-url', undefined, 50),
        historyItem('valid', 'https://valid.example.com/', 1),
      ],
    )

    expect(suggestions.map(item => item.id)).toEqual(['valid'])
  })

  it('respects the requested suggestion limit without mutating history input', () => {
    const history = [
      historyItem('first', 'https://first.example.com/', 1),
      historyItem('second', 'https://second.example.com/', 3),
      historyItem('third', 'https://third.example.com/', 2),
    ]

    expect(buildHistorySuggestions([], history, 2).map(item => item.id)).toEqual(['second', 'third'])
    expect(history.map(item => item.id)).toEqual(['first', 'second', 'third'])
  })
})
