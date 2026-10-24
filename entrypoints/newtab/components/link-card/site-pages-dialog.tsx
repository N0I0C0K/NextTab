import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { ArrowUpRight, Search, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input } from '@/components/shared'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/shared/ui/tabs'
import { useStorage } from '@/utils'
import { quickUrlItemsStorage, settingStorage } from '@/utils/storage'
import { t } from '@/utils/i18n'
import { findBookmarksByDomain, type SiteBookmark } from '../../lib/bookmarks'
import {
  buildReturnPages,
  getHistoryWindowStart,
  groupPageTabs,
  normalizePageUrl,
  queryProfileTabs,
  switchToPageTab,
  type ReturnPage,
} from '../../services/return-pages'
import { PageRow } from '../return-pages/page-row'
import { NavigationList, focusNavigationFromSearch, type NavigationItem } from '../navigation/navigation-list'
import { matchesSearch, openSavedUrl } from '@/utils/quick-link-search'
import { useProfileTabsState } from '../../hooks/useOpenTabs'
import { LinkCardIcon } from './link-card-icon'

type Source = 'tabs' | 'saved' | 'history'
type Snapshot<T> = { scope: string; items: T[]; loading: boolean; error: boolean }

export function SitePagesDialog({
  url,
  title,
  open,
  onOpenChange,
  finalFocus,
  initialSource,
}: {
  url: string
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus: RefObject<HTMLButtonElement>
  initialSource?: 'tabs' | 'bookmarks'
}) {
  const settings = useStorage(settingStorage)
  const quickUrls = useStorage(quickUrlItemsStorage)
  const [source, setSource] = useState<Source>('tabs')
  const [query, setQuery] = useState('')
  const [reload, setReload] = useState(0)
  const [closedIds, setClosedIds] = useState<Set<number>>(new Set())
  const [history, setHistory] = useState<Snapshot<ReturnPage>>({ scope: '', items: [], loading: true, error: false })
  const [bookmarks, setBookmarks] = useState<Snapshot<SiteBookmark>>({
    scope: '',
    items: [],
    loading: true,
    error: false,
  })
  const liveTabs = useProfileTabsState(open && settings.showOpenTabsInQuickUrlMenu)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const host = useMemo(() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  }, [url])
  const bookmarkScope = host + ':' + (settings.bookmarkFolderId ?? '')
  const matches = useCallback(
    (value: string) => {
      try {
        return new URL(value).hostname === host
      } catch {
        return false
      }
    },
    [host],
  )
  useEffect(() => {
    if (!open) return
    setSource(initialSource === 'bookmarks' ? 'saved' : 'tabs')
    setQuery('')
    setClosedIds(new Set())
  }, [open, initialSource, host])

  useEffect(() => {
    if (!open || !host) return
    let cancelled = false
    let allRemoved = false
    const removed = new Set<string | null>()
    setHistory(previous => ({
      scope: host,
      items: previous.scope === host ? previous.items : [],
      loading: true,
      error: false,
    }))
    void chrome.history.search({ text: host, startTime: getHistoryWindowStart(180), maxResults: 300 }).then(
      items => {
        if (cancelled) return
        const pages = buildReturnPages(items, 'recent', new Map(), Date.now(), 180)
        setHistory({
          scope: host,
          items: allRemoved ? [] : pages.filter(page => !removed.has(normalizePageUrl(page.url))),
          loading: false,
          error: false,
        })
      },
      () => {
        if (!cancelled) setHistory(previous => ({ ...previous, loading: false, error: true }))
      },
    )
    const onRemoved = (event: chrome.history.RemovedResult) => {
      if (event.allHistory) allRemoved = true
      for (const value of event.urls ?? []) removed.add(normalizePageUrl(value))
      setHistory(previous => ({
        ...previous,
        items: allRemoved ? [] : previous.items.filter(page => !removed.has(normalizePageUrl(page.url))),
      }))
    }
    chrome.history.onVisitRemoved.addListener(onRemoved)
    return () => {
      cancelled = true
      chrome.history.onVisitRemoved.removeListener(onRemoved)
    }
  }, [open, host, reload])

  useEffect(() => {
    if (!open || !host || !settings.showBookmarksInQuickUrlMenu) return
    let cancelled = false
    setBookmarks(previous => ({
      scope: bookmarkScope,
      items: previous.scope === bookmarkScope ? previous.items : [],
      loading: true,
      error: false,
    }))
    void findBookmarksByDomain(host, settings.bookmarkFolderId).then(
      items => {
        if (!cancelled) setBookmarks({ scope: bookmarkScope, items, loading: false, error: false })
      },
      () => {
        if (!cancelled) setBookmarks(previous => ({ ...previous, loading: false, error: true }))
      },
    )
    return () => {
      cancelled = true
    }
  }, [open, host, bookmarkScope, settings.bookmarkFolderId, settings.showBookmarksInQuickUrlMenu, reload])

  const tabItems = useMemo<NavigationItem[]>(() => {
    if (!open || !settings.showOpenTabsInQuickUrlMenu) return []
    const windows = new Map(
      [...new Set(liveTabs.tabs.map(tab => tab.windowId))].map((windowId, index) => [windowId, index + 1]),
    )
    return liveTabs.tabs
      .filter(tab => tab.id !== undefined && !closedIds.has(tab.id) && matches(tab.url ?? tab.pendingUrl ?? ''))
      .sort((a, b) => a.windowId - b.windowId || a.index - b.index)
      .map(tab => ({
        id: String(tab.id),
        tabId: tab.id,
        title: tab.title || tab.url || '',
        url: tab.url ?? tab.pendingUrl ?? '',
        detail:
          t('tabWindow', String(windows.get(tab.windowId))) +
          ' · ' +
          t('tabPosition', String(tab.index + 1)) +
          (tab.discarded ? ' · ' + t('navigationSleeping') : ''),
      }))
  }, [open, settings.showOpenTabsInQuickUrlMenu, liveTabs.tabs, closedIds, matches])
  const savedItems = useMemo<NavigationItem[]>(
    () =>
      !open
        ? []
        : [
            ...quickUrls
              .filter(item => matches(item.url) && normalizePageUrl(item.url))
              .map(item => ({ ...item, id: 'quick:' + item.id, detail: t('siteQuickLinkSource') })),
            ...(settings.showBookmarksInQuickUrlMenu && bookmarks.scope === bookmarkScope ? bookmarks.items : []).map(
              item => ({
                id: 'bookmark:' + item.id,
                title: item.title || item.url!,
                url: item.url!,
                detail: t('siteBookmarkSource') + (item.folderPath ? ' · ' + item.folderPath : ''),
              }),
            ),
          ],
    [open, quickUrls, matches, settings.showBookmarksInQuickUrlMenu, bookmarks, bookmarkScope],
  )
  const historyPages = useMemo(
    () => (open && history.scope === host ? history.items.filter(page => matches(page.url)) : []),
    [open, history, host, matches],
  )
  const historyById = useMemo(() => new Map(historyPages.map(page => [page.id, page])), [historyPages])
  const historyItems = useMemo<NavigationItem[]>(
    () => historyPages.map(page => ({ id: page.id, title: page.title, url: page.url })),
    [historyPages],
  )
  const exactTabs = useMemo(() => groupPageTabs(liveTabs.tabs, true), [liveTabs.tabs])
  const pageTabs = useMemo(() => groupPageTabs(liveTabs.tabs), [liveTabs.tabs])
  const items = source === 'tabs' ? tabItems : source === 'saved' ? savedItems : historyItems
  const filtered = items.filter(item =>
    matchesSearch(query, item.title, item.url, source === 'saved' ? (item.detail ?? '') : ''),
  )
  const tabsUnknown = settings.showOpenTabsInQuickUrlMenu && (liveTabs.loading || liveTabs.error)
  const bookmarksUnknown =
    settings.showBookmarksInQuickUrlMenu && (bookmarks.scope !== bookmarkScope || bookmarks.loading || bookmarks.error)
  const historyUnknown = history.scope !== host || history.loading || history.error
  const unknown = source === 'tabs' ? tabsUnknown : source === 'saved' ? bookmarksUnknown : historyUnknown
  const error =
    source === 'tabs'
      ? settings.showOpenTabsInQuickUrlMenu && liveTabs.error
      : source === 'saved'
        ? settings.showBookmarksInQuickUrlMenu && bookmarks.scope === bookmarkScope && bookmarks.error
        : history.scope === host && history.error
  const disabled = source === 'tabs' && !settings.showOpenTabsInQuickUrlMenu
  const labels = { tabs: t('relatedOpenTabs'), saved: t('siteSavedTab'), history: t('siteHistoryTab') }
  const counts = {
    tabs: tabsUnknown ? '—' : String(tabItems.length),
    saved: bookmarksUnknown ? '—' : String(savedItems.length),
    history: historyUnknown ? '—' : String(historyItems.length),
  }
  const searchLabel = t(
    source === 'tabs' ? 'siteSearchTabs' : source === 'saved' ? 'siteSearchSaved' : 'siteSearchHistory',
  )
  const openItem = async (item: NavigationItem, newTab: boolean) => {
    if (item.tabId === undefined) return openSavedUrl(item.url, newTab)
    const current = (await queryProfileTabs()).find(
      tab => tab.id === item.tabId && matches(tab.url ?? tab.pendingUrl ?? ''),
    )
    if (current) await switchToPageTab(current)
    else {
      setClosedIds(ids => new Set([...ids, item.tabId!]))
      liveTabs.retry()
    }
  }
  const closeItem = async (item: NavigationItem) => {
    const current = (await queryProfileTabs()).find(
      tab => tab.id === item.tabId && matches(tab.url ?? tab.pendingUrl ?? ''),
    )
    if (current?.id !== undefined) await chrome.tabs.remove(current.id)
    setClosedIds(ids => new Set([...ids, item.tabId!]))
  }
  const home = (
    <button
      className="nt-view-all nt-site-home"
      type="button"
      onClick={event => {
        void openSavedUrl(url, event.ctrlKey || event.metaKey).catch(() => toast.error(t('returnOpenFailed')))
      }}>
      {t('siteOpenHome')}
      <ArrowUpRight size={14} />
    </button>
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="nt-site-pages-dialog"
        data-testid="site-pages-dialog"
        data-site-tabs
        initialFocus={titleRef}
        finalFocus={finalFocus}>
        <DialogHeader>
          <div className="nt-site-detail-heading">
            <LinkCardIcon url={url} title={title} />
            <div>
              <DialogTitle
                render={
                  <h2 ref={titleRef} tabIndex={-1}>
                    {title}
                  </h2>
                }
                className="leading-tight outline-none"
                title={title}>
                {title}
              </DialogTitle>
              <DialogDescription title={host}>{host}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <Tabs
          value={source}
          onValueChange={value => {
            setSource(value as Source)
            setQuery('')
          }}
          className="nt-site-detail-tabs">
          <TabsList variant="line" className="nt-site-detail-tablist" aria-label={t('sitePageSources')}>
            {(['tabs', 'saved', 'history'] as const).map(key => (
              <TabsTrigger key={key} value={key} data-testid={'site-tab-' + key}>
                {labels[key]}
                <span className="nt-site-detail-count">{counts[key]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="nt-site-detail-search">
            <Search size={16} aria-hidden="true" />
            <Input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              aria-label={searchLabel}
              placeholder={searchLabel}
              onKeyDown={focusNavigationFromSearch}
            />
            {query && (
              <button
                type="button"
                aria-label={t('clearSearch')}
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}>
                <X size={14} />
              </button>
            )}
          </div>
          {(['tabs', 'saved', 'history'] as const).map(key => (
            <TabsContent key={key} value={key} className="nt-site-detail-panel">
              {source === key && (
                <>
                  {error && (
                    <p role="status" className="nt-navigation-error">
                      {t('navigationReadFailed')}
                      <button
                        type="button"
                        onClick={() => {
                          liveTabs.retry()
                          setReload(value => value + 1)
                        }}>
                        {t('retryAction')}
                      </button>
                    </p>
                  )}
                  {unknown && !error && !items.length && (
                    <p role="status" className="nt-site-detail-loading">
                      {t('loading')}
                    </p>
                  )}
                  <NavigationList
                    key={key}
                    items={filtered}
                    resetKey={id + ':' + key + ':' + query}
                    onOpen={openItem}
                    onClose={closeItem}
                    unknown={unknown}
                    footerAction={home}
                    emptyText={
                      <>
                        {disabled
                          ? t('siteTabsDisabled')
                          : query
                            ? t('noResultsFound')
                            : t('siteSourceEmpty', labels[key])}
                        {!query && !unknown && !disabled && (
                          <span className="nt-site-detail-empty-links">
                            {(['tabs', 'saved', 'history'] as const)
                              .filter(value => value !== source)
                              .map(value => (
                                <button
                                  key={value}
                                  type="button"
                                  className="nt-view-all"
                                  onClick={() => setSource(value)}>
                                  {labels[value]}
                                  <ArrowUpRight size={12} />
                                </button>
                              ))}
                          </span>
                        )}
                      </>
                    }
                    renderItem={(item, actions) => (
                      <PageRow
                        page={
                          key === 'history' ? historyById.get(item.id)! : { ...item, lastVisitTime: 0, activeDays: 0 }
                        }
                        tabs={liveTabs.tabs}
                        tabId={key === 'tabs' ? item.tabId : undefined}
                        exactUrl={key !== 'history'}
                        detail={key !== 'history' ? item.detail : undefined}
                        matchingTabs={
                          key !== 'history'
                            ? (exactTabs.get(item.url) ?? [])
                            : (pageTabs.get(normalizePageUrl(item.url)!) ?? [])
                        }
                        onOpen={key !== 'history' ? newTab => openItem(item, newTab) : undefined}
                        onCloseTab={key === 'tabs' ? actions.close : undefined}
                        closeDisabled={actions.closing}
                      />
                    )}
                  />
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
