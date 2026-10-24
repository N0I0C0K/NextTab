import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPopupSitePages, openPopupPage, popupHost, previewPopupSitePages } from './popup-pages'

const tab = (id: number, url: string, extra: Partial<chrome.tabs.Tab> = {}) =>
  ({ id, url, windowId: 1, index: id, incognito: false, ...extra }) as chrome.tabs.Tab
const current = tab(1, 'https://github.com/project')
const history = (url: string, time = 1) => ({ id: url, url, lastVisitTime: time }) as chrome.history.HistoryItem
const plain = { ctrlKey: false, metaKey: false, shiftKey: false }
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('popup site pages', () => {
  it('matches exact hostnames, excludes the current tab and isolates private tabs', () => {
    const tabs = [
      current,
      tab(2, 'http://github.com:8080/issues'),
      tab(3, 'https://docs.github.com/issues'),
      tab(4, 'https://github.com.evil.test/'),
      tab(5, 'https://github.com/private', { incognito: true }),
      tab(6, 'https://github.com/issues'),
    ]
    const result = buildPopupSitePages(current, tabs, [])
    expect(result.opened.map(page => page.tabId)).toEqual([2, 6])
    expect(popupHost('chrome://extensions')).toBeNull()
    expect(popupHost('https://user:password@github.com')).toBeNull()
  })
  it('keeps duplicate real tabs and complete query/fragment URLs while removing open/current history', () => {
    const a = 'https://github.com/issues?q=a#top'
    const b = 'https://github.com/issues?q=b'
    const result = buildPopupSitePages(
      current,
      [tab(2, a), tab(3, a, { windowId: 2 })],
      [history(current.url!), history(a), history(b, 20), history(b, 10), history('https://docs.github.com/nope', 30)],
    )
    expect(result.opened.map(page => page.id)).toEqual(['tab:2', 'tab:3'])
    expect(result.recent.map(page => page.url)).toEqual([b])
  })
  it('never includes normal history in private contexts', () => {
    const privateCurrent = tab(1, current.url!, { incognito: true })
    const result = buildPopupSitePages(
      privateCurrent,
      [tab(2, 'https://github.com/secret', { incognito: true }), tab(3, 'https://github.com/normal')],
      [history('https://github.com/history')],
    )
    expect(result.opened.map(page => page.tabId)).toEqual([2])
    expect(result.recent).toEqual([])
  })
  it('reserves preview space for both sources and fills missing sources to four', () => {
    const pages = Array.from({ length: 8 }, (_, index) => ({
      id: String(index),
      title: 'Page',
      url: `https://github.com/${index}`,
    }))
    expect(previewPopupSitePages(pages.slice(0, 4), pages.slice(4))).toEqual([pages[0], pages[1], pages[4], pages[5]])
    expect(previewPopupSitePages(pages, [])).toHaveLength(4)
    expect(previewPopupSitePages([], pages)).toHaveLength(4)
    expect(previewPopupSitePages(pages.slice(0, 1), pages.slice(1))).toHaveLength(4)
  })
  it('revalidates a target before activating it and focusing its actual window', async () => {
    const actual = tab(2, 'https://github.com/issues', { windowId: 9 })
    const update = vi.fn().mockResolvedValue(actual)
    const focus = vi.fn().mockResolvedValue({})
    vi.stubGlobal('chrome', {
      extension: {},
      tabs: { get: vi.fn().mockResolvedValue(actual), update },
      windows: { update: focus },
    })
    await openPopupPage({ id: 'tab:2', tabId: 2, title: 'Issues', url: actual.url! }, current, plain)
    expect(update).toHaveBeenCalledWith(2, { active: true })
    expect(focus).toHaveBeenCalledWith(9, { focused: true })
  })
  it('rejects navigated or private target tabs instead of switching to a stale result', async () => {
    const get = vi.fn().mockResolvedValue(tab(2, 'https://github.com/different'))
    const update = vi.fn()
    vi.stubGlobal('chrome', { extension: {}, tabs: { get, update } })
    const page = { id: 'tab:2', tabId: 2, title: 'Issues', url: 'https://github.com/issues' }
    await expect(openPopupPage(page, current, plain)).rejects.toThrow('Tab changed')
    get.mockResolvedValue(tab(2, page.url, { pendingUrl: 'https://github.com/navigating' }))
    await expect(openPopupPage(page, current, plain)).rejects.toThrow('Tab changed')
    get.mockResolvedValue(tab(2, page.url, { incognito: true }))
    await expect(openPopupPage(page, current, plain)).rejects.toThrow('Tab changed')
    expect(update).not.toHaveBeenCalled()
  })
  it('opens saved/history pages in new tabs and preserves window and adjacent-tab shortcuts', async () => {
    const createTab = vi.fn().mockResolvedValue({})
    const createWindow = vi.fn().mockResolvedValue({})
    vi.stubGlobal('chrome', {
      extension: {},
      tabs: { create: createTab, get: vi.fn().mockResolvedValue({ ...current, index: 8 }) },
      windows: { create: createWindow },
    })
    const page = { id: 'saved:1', title: 'Saved', url: 'https://example.com/?q=1#section' }
    await openPopupPage(page, current, plain)
    expect(createTab).toHaveBeenLastCalledWith({ url: page.url, active: true, windowId: 1 })
    await openPopupPage(page, current, { ...plain, ctrlKey: true, shiftKey: true })
    expect(createTab).toHaveBeenLastCalledWith({ url: page.url, active: true, windowId: 1, index: 9 })
    await openPopupPage(page, { ...current, incognito: true }, { ...plain, shiftKey: true })
    expect(createWindow).toHaveBeenLastCalledWith({ url: page.url, focused: true, incognito: true })
  })
})
