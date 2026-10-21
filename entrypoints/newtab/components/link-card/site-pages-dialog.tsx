import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ArrowLeft, ArrowUpRight, History } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input } from '@/components/shared'
import { useStorage } from '@/utils'
import { quickUrlItemsStorage, settingStorage } from '@/utils/storage'
import { t } from '@/utils/i18n'
import { findBookmarksByDomain } from '../../lib/bookmarks'
import { buildReturnPages, getHistoryWindowStart, normalizePageUrl, type ReturnPage } from '../../services/return-pages'
import { PageList } from '../return-pages/page-list'
import { NavigationList, focusNavigationFromSearch, type NavigationItem } from '../navigation/navigation-list'
import { matchesSearch, openSavedUrl } from '@/utils/quick-link-search'
import { queryProfileTabs, switchToPageTab } from '../../services/return-pages'
import { useProfileTabsState } from '../../hooks/useOpenTabs'
import type { SiteBookmark } from '../../lib/bookmarks'

export function SitePagesDialog({
  url,
  title,
  tabs,
  open,
  onOpenChange,
  finalFocus,
  initialSource,
}: {
  url: string
  title: string
  tabs: chrome.tabs.Tab[]
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus: RefObject<HTMLButtonElement>
  initialSource?: 'tabs' | 'bookmarks'
}) {
  const settings = useStorage(settingStorage)
  const quickUrls = useStorage(quickUrlItemsStorage)
  const [history, setHistory] = useState<ReturnPage[]>([])
  const [bookmarks, setBookmarks] = useState<SiteBookmark[]>([])
  const [bookmarkScope, setBookmarkScope] = useState('')
  const [bookmarkError, setBookmarkError] = useState(false)
  const [source, setSource] = useState(initialSource)
  const [reload, setReload] = useState(0)
  const [closedIds, setClosedIds] = useState<Set<number>>(new Set())
  const liveTabs = useProfileTabsState(open && settings.showOpenTabsInQuickUrlMenu)
  const [loading, setLoading] = useState(true)
  const [historyError, setHistoryError] = useState(false)
  const [historyView, setHistoryView] = useState(false)
  const [query, setQuery] = useState('')
  const titleRef = useRef<HTMLHeadingElement>(null)
  const host = useMemo(() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  }, [url])
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
  const scope = host + ':' + (settings.bookmarkFolderId ?? '')
  const visibleBookmarks = useMemo(
    () => (settings.showBookmarksInQuickUrlMenu && bookmarkScope === scope ? bookmarks : []),
    [settings.showBookmarksInQuickUrlMenu, bookmarkScope, scope, bookmarks],
  )
  const fullSource =
    (source === 'tabs' && settings.showOpenTabsInQuickUrlMenu) ||
    (source === 'bookmarks' && settings.showBookmarksInQuickUrlMenu)
      ? source
      : undefined
  useEffect(() => {
    if (open) {
      setSource(initialSource)
      setClosedIds(new Set())
      setQuery('')
      setHistoryView(false)
    }
  }, [open, initialSource])

  useEffect(() => {
    if (!open || !host) return
    let cancelled = false
    let historyInvalidated = false
    setLoading(true)
    setHistoryError(false)
    setBookmarkError(false)
    void Promise.allSettled([
      chrome.history.search({ text: host, startTime: getHistoryWindowStart(180), maxResults: 300 }),
      settings.showBookmarksInQuickUrlMenu
        ? findBookmarksByDomain(host, settings.bookmarkFolderId)
        : Promise.resolve([]),
    ]).then(([recent, saved]) => {
      if (cancelled) return
      if (!historyInvalidated) {
        setHistory(
          recent.status === 'fulfilled' ? buildReturnPages(recent.value, 'recent', new Map(), Date.now(), 180) : [],
        )
        setHistoryError(recent.status === 'rejected')
      }
      if (saved.status === 'fulfilled') {
        setBookmarks(saved.value)
        setBookmarkScope(scope)
      } else setBookmarkError(true)
      setLoading(false)
    })
    const onRemoved = (event: chrome.history.RemovedResult) => {
      historyInvalidated = true
      const removed = new Set((event.urls ?? []).map(normalizePageUrl))
      setHistory(items => (event.allHistory ? [] : items.filter(item => !removed.has(normalizePageUrl(item.url)))))
    }
    chrome.history.onVisitRemoved.addListener(onRemoved)
    return () => {
      cancelled = true
      chrome.history.onVisitRemoved.removeListener(onRemoved)
    }
  }, [open, host, settings.showBookmarksInQuickUrlMenu, settings.bookmarkFolderId, scope, reload])

  const seen = new Set<string>()
  const unique = (items: ReturnPage[]) =>
    items.filter(item => {
      const normalized = normalizePageUrl(item.url)
      if (!normalized || seen.has(normalized) || !matches(item.url)) return false
      seen.add(normalized)
      return true
    })
  // Actual tabs stay separate, even for the same page, so each close action has one target.
  const opened =
    open && !fullSource && settings.showOpenTabsInQuickUrlMenu
      ? tabs.flatMap(tab => {
          const tabUrl = tab.url ?? tab.pendingUrl
          const normalized = tabUrl ? normalizePageUrl(tabUrl) : null
          if (tab.id === undefined || !tabUrl || !normalized || !matches(tabUrl)) return []
          seen.add(normalized)
          return [
            {
              id: String(tab.id),
              tabId: tab.id,
              url: tabUrl,
              title: tab.title || tabUrl,
              lastVisitTime: 0,
              activeDays: 0,
            },
          ]
        })
      : []
  const saved =
    open && !fullSource
      ? unique([
          ...quickUrls
            .filter(item => normalizePageUrl(item.url) !== normalizePageUrl(url))
            .map(item => ({ ...item, lastVisitTime: 0, activeDays: 0 })),
          ...visibleBookmarks.flatMap(item =>
            item.url && normalizePageUrl(item.url) !== normalizePageUrl(url)
              ? [{ id: item.id, url: item.url, title: item.title || item.url, lastVisitTime: 0, activeDays: 0 }]
              : [],
          ),
        ])
      : []
  const recent =
    open && !fullSource ? unique(history.filter(item => item.lastVisitTime >= getHistoryWindowStart(7))) : []
  const allHistory = history.filter(
    item => matches(item.url) && `${item.title} ${item.url}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )
  const focusAfterClosingTab = (tabId: number) => {
    const dialog = titleRef.current?.closest('[role="dialog"]')
    if (!dialog) return
    const rows = [...dialog.querySelectorAll<HTMLElement>('[data-testid="return-page-row"]')]
    const index = rows.findIndex(row => row.dataset.tabId === String(tabId))
    const next = rows[index + 1] ?? rows[index - 1]
    const button = next?.querySelector<HTMLButtonElement>('.nt-return-open')
    if (button) button.focus()
    else titleRef.current?.focus()
  }
  const sourceItems = useMemo<NavigationItem[]>(() => {
    if (!open) return []
    const windowNumbers = new Map(
      [...new Set(liveTabs.tabs.map(tab => tab.windowId))].map((id, index) => [id, index + 1]),
    )
    return fullSource === 'tabs'
      ? liveTabs.tabs
          .filter(tab => tab.id !== undefined && !closedIds.has(tab.id) && matches(tab.url ?? tab.pendingUrl ?? ''))
          .sort((a, b) => a.windowId - b.windowId || a.index - b.index)
          .map(tab => ({
            id: String(tab.id),
            tabId: tab.id,
            title: tab.title || tab.url || '',
            url: tab.url ?? tab.pendingUrl ?? '',
            detail:
              t('tabWindow', String(windowNumbers.get(tab.windowId))) +
              ' · ' +
              t('tabPosition', String(tab.index + 1)) +
              (tab.discarded ? ' · ' + t('navigationSleeping') : ''),
          }))
      : visibleBookmarks.map(bookmark => ({
          id: bookmark.id,
          title: bookmark.title || bookmark.url!,
          url: bookmark.url!,
          detail: bookmark.folderPath,
        }))
  }, [open, fullSource, liveTabs.tabs, closedIds, matches, visibleBookmarks])
  const filteredItems = sourceItems.filter(item =>
    matchesSearch(query, item.title, item.url, fullSource === 'bookmarks' ? (item.detail ?? '') : ''),
  )
  const openSourceItem = async (item: NavigationItem, newTab: boolean) => {
    if (item.tabId === undefined) {
      await openSavedUrl(item.url, newTab)
      return
    }
    const current = (await queryProfileTabs()).find(
      tab => tab.id === item.tabId && matches(tab.url ?? tab.pendingUrl ?? ''),
    )
    if (current) await switchToPageTab(current)
    else {
      setClosedIds(ids => new Set([...ids, item.tabId!]))
      liveTabs.retry()
    }
  }
  const closeSourceItem = async (item: NavigationItem) => {
    const current = (await queryProfileTabs()).find(
      tab => tab.id === item.tabId && matches(tab.url ?? tab.pendingUrl ?? ''),
    )
    if (current?.id !== undefined) await chrome.tabs.remove(current.id)
    setClosedIds(ids => new Set([...ids, item.tabId!]))
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="nt-site-pages-dialog"
        data-testid="site-pages-dialog"
        data-history-view={historyView ? 'true' : 'false'}
        data-navigation-view={!!fullSource}
        initialFocus={titleRef}
        finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle
            render={
              <h2 ref={titleRef} tabIndex={-1}>
                {title}
              </h2>
            }
            className="leading-tight outline-none">
            {title}
          </DialogTitle>
          <DialogDescription>{host}</DialogDescription>
        </DialogHeader>
        {fullSource ? (
          <>
            <div className="nt-navigation-sources">
              <button type="button" className="nt-view-all" onClick={() => setSource(undefined)}>
                <ArrowLeft size={14} />
                {t('returnToSitePages')}
              </button>
              {settings.showOpenTabsInQuickUrlMenu && (
                <button type="button" aria-pressed={fullSource === 'tabs'} onClick={() => setSource('tabs')}>
                  {t('relatedOpenTabs')}
                </button>
              )}
              {settings.showBookmarksInQuickUrlMenu && (
                <button type="button" aria-pressed={fullSource === 'bookmarks'} onClick={() => setSource('bookmarks')}>
                  {t('relatedBookmarks')}
                </button>
              )}
            </div>
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              aria-label={t('navigationSearch')}
              onKeyDown={focusNavigationFromSearch}
              placeholder={t('navigationSearch')}
            />
            {(fullSource === 'tabs' ? liveTabs.error : bookmarkError) && (
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
            {loading && fullSource === 'bookmarks' && !visibleBookmarks.length && <p role="status">{t('loading')}</p>}
            <NavigationList
              items={filteredItems}
              resetKey={fullSource + ':' + query}
              onOpen={openSourceItem}
              onClose={closeSourceItem}
              unknown={fullSource === 'tabs' ? liveTabs.error || liveTabs.loading : bookmarkError || loading}
            />
          </>
        ) : (
          <>
            {historyView && (
              <div className="nt-site-history-toolbar">
                <button className="nt-view-all" type="button" onClick={() => setHistoryView(false)}>
                  <ArrowLeft size={14} />
                  {t('returnToSitePages')}
                </button>
                <Input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  aria-label={t('searchInDomain')}
                  placeholder={t('searchInDomain')}
                />
              </div>
            )}
            <div className="nt-site-pages-body">
              {historyView ? (
                <>
                  <PageList key={query} pages={allHistory} tabs={tabs} />
                  {!allHistory.length && (
                    <p className="nt-return-empty">{historyError ? t('returnHistoryError') : t('noHistoryFound')}</p>
                  )}
                </>
              ) : (
                <>
                  {[
                    [t('relatedOpenTabs'), opened],
                    [t('siteSavedPages'), saved],
                    [t('siteRecentPages'), recent],
                  ].map(([heading, items]) => {
                    const pages = items as (ReturnPage & { tabId?: number })[]
                    return pages.length ? (
                      <section className="nt-site-pages-group" key={heading as string}>
                        <h3>{heading as string}</h3>
                        <PageList pages={pages} tabs={tabs} onTabClosed={focusAfterClosingTab} />
                      </section>
                    ) : null
                  })}
                  {loading ? (
                    <p className="nt-return-empty" role="status">
                      {t('loading')}
                    </p>
                  ) : historyError ? (
                    <p className="nt-return-empty" role="status">
                      {t('returnHistoryError')}
                    </p>
                  ) : (
                    !opened.length &&
                    !saved.length &&
                    !recent.length && <p className="nt-return-empty">{t('sitePagesEmpty')}</p>
                  )}
                </>
              )}
            </div>
            <footer className="nt-site-pages-footer">
              {!historyView && (
                <button className="nt-view-all" type="button" onClick={() => setHistoryView(true)}>
                  <History size={14} />
                  {t('viewRecentHistory')}
                </button>
              )}
              <button
                className="nt-view-all"
                type="button"
                onClick={event => {
                  if (event.ctrlKey || event.metaKey) void chrome.tabs.create({ url, active: true })
                  else void chrome.tabs.update({ url })
                }}>
                {t('siteOpenHome')}
                <ArrowUpRight size={14} />
              </button>
            </footer>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
