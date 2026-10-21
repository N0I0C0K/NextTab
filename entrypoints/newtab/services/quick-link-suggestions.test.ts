import { describe, expect, it } from 'vitest'
import { selectQuickLinkSuggestions } from './quick-link-suggestions'

describe('quick link suggestions', () => {
  it('keeps browser order, recommends homepages and excludes saved sites and duplicates', () => {
    expect(
      selectQuickLinkSuggestions(
        [
          { title: 'Saved', url: 'https://www.saved.example/docs' },
          { title: 'First', url: 'https://first.example/project?q=private#section' },
          { title: 'First duplicate', url: 'http://www.first.example/other' },
          { title: '  ', url: 'https://second.example/path' },
          { title: 'Invalid', url: 'broken' },
          { title: 'Internal', url: 'chrome://settings' },
          { title: 'Third', url: 'https://third.example/' },
          { title: 'Fourth', url: 'https://fourth.example/' },
          { title: 'Fifth', url: 'https://fifth.example/' },
        ],
        [{ id: 'saved', title: 'Saved page', url: 'http://saved.example/another' }],
      ),
    ).toEqual([
      { title: 'First', url: 'https://first.example/' },
      { title: 'second.example', url: 'https://second.example/' },
      { title: 'Third', url: 'https://third.example/' },
      { title: 'Fourth', url: 'https://fourth.example/' },
    ])
  })
})
