import { describe, expect, it } from 'vitest'
import { collectSiteBookmarks } from './bookmarks'

describe('site bookmarks', () => {
  const tree: chrome.bookmarks.BookmarkTreeNode[] = [
    {
      id: '0',
      title: '',
      children: [
        {
          id: 'folder',
          title: 'Work',
          children: [
            { id: 'first', title: 'Saved', url: 'https://example.com/a' },
            {
              id: 'nested',
              title: 'Research',
              children: [
                { id: 'duplicate', title: 'Saved', url: 'https://example.com/a' },
                { id: 'subdomain', title: 'No', url: 'https://sub.example.com/' },
                { id: 'suffix', title: 'No', url: 'https://notexample.com/' },
              ],
            },
          ],
        },
        {
          id: 'other',
          title: 'Other',
          children: [{ id: 'outside', title: 'Outside', url: 'http://example.com:8080/' }],
        },
      ],
    },
  ]
  it('traverses the full tree, keeps duplicate bookmarks and includes folder paths', () => {
    const results = collectSiteBookmarks(tree, 'example.com')
    expect(results.map(item => item.id)).toEqual(['first', 'duplicate', 'outside'])
    expect(results[1].folderPath).toBe('Work / Research')
  })
  it('never broadens a selected folder when it is deleted or has no matches', () => {
    expect(collectSiteBookmarks(tree, 'example.com', 'nested').map(item => item.id)).toEqual(['duplicate'])
    expect(collectSiteBookmarks(tree, 'example.com', 'deleted')).toEqual([])
  })
})
