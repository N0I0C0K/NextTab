import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildQuickLinkSuggestions,
  fetchQuickLinkSuggestions,
  selectQuickLinkSuggestions,
} from './quick-link-suggestions'
import type { ActivitySnapshot } from '@/utils/page-activity/model'

afterEach(() => vi.unstubAllGlobals())

describe('quick link suggestions', () => {
  it('keeps usage order, recommends homepages and excludes saved sites and duplicates', () => {
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

  it('combines foreground usage across a site and ignores pages without paired events or outside seven days', () => {
    const now = new Date(2026, 9, 22, 12).getTime()
    const urls = [
      'https://first.test/a',
      'https://www.first.test/b',
      'https://second.test/a',
      'https://old.test/',
      'https://unpaired.test/',
    ]
    const snapshot: ActivitySnapshot = {
      now,
      bytes: 0,
      activeViewId: null,
      pages: urls.map((url, id) => ({ id, key: url, url, title: `Page ${id}` })),
      events: urls.flatMap((_, id) => {
        const start = now - (id === 3 ? 8 * 86400000 : 600000)
        return [
          { id: id * 2, pageId: id, viewId: String(id), type: 'enter' as const, source: 'tab' as const, at: start },
          ...(id === 4
            ? []
            : [
                {
                  id: id * 2 + 1,
                  pageId: id,
                  viewId: String(id),
                  type: 'leave' as const,
                  source: 'tab' as const,
                  at: start + (id === 2 ? 300000 : 60000),
                },
              ]),
        ]
      }),
    }
    expect(buildQuickLinkSuggestions(snapshot)).toEqual([
      { title: 'Page 0', url: 'https://first.test/' },
      { title: 'Page 2', url: 'https://second.test/' },
    ])
    expect(buildQuickLinkSuggestions({ ...snapshot, events: [] })).toEqual([])
  })

  it('requests the matching browsing context and does not fall back to top sites after missing or failed logs', async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValue({ pages: [], events: [], now: Date.now(), bytes: 0, activeViewId: null })
    const topSites = vi.fn()
    vi.stubGlobal('chrome', {
      extension: { inIncognitoContext: true },
      runtime: { sendMessage },
      topSites: { get: topSites },
    })
    await expect(fetchQuickLinkSuggestions()).resolves.toEqual([])
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'nexttab:page-activity-snapshot', incognito: true })
    sendMessage.mockResolvedValueOnce(null)
    await expect(fetchQuickLinkSuggestions()).rejects.toThrow('Activity log unavailable')
    sendMessage.mockRejectedValueOnce(new Error('Offline'))
    await expect(fetchQuickLinkSuggestions()).rejects.toThrow('Offline')
    expect(topSites).not.toHaveBeenCalled()
  })
})
