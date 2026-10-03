import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ArrowLeft, ArrowUpRight, History } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, Input } from '@/components/shared'
import { useStorage } from '@/utils'
import { quickUrlItemsStorage, settingStorage } from '@/utils/storage'
import { t } from '@/utils/i18n'
import { findBookmarksByDomain } from '../../lib/bookmarks'
import { buildReturnPages, getHistoryWindowStart, normalizePageUrl, type ReturnPage } from '../../services/return-pages'
import { PageList } from '../return-pages/page-list'

export function SitePagesDialog({
  url,
  title,
  tabs,
  open,
  onOpenChange,
  finalFocus,
}: {
  url: string
  title: string
  tabs: chrome.tabs.Tab[]
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus: RefObject<HTMLButtonElement>
}) {
  const settings = useStorage(settingStorage)
  const quickUrls = useStorage(quickUrlItemsStorage)
  const [history, setHistory] = useState<ReturnPage[]>([])
  const [bookmarks, setBookmarks] = useState<chrome.bookmarks.BookmarkTreeNode[]>([])
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
  const matches = (value: string) => {
    try {
      return new URL(value).hostname === host
    } catch {
      return false
    }
  }

  useEffect(() => {
    if (!open || !host) return
    let cancelled = false
    setLoading(true)
    setHistory([])
    setBookmarks([])
    setHistoryError(false)
    setHistoryView(false)
    setQuery('')
    void Promise.allSettled([
      chrome.history.search({ text: host, startTime: getHistoryWindowStart(180), maxResults: 300 }),
      settings.showBookmarksInQuickUrlMenu
        ? findBookmarksByDomain(host, settings.bookmarkFolderId)
        : Promise.resolve([]),
    ]).then(([recent, saved]) => {
      if (cancelled) return
      setHistory(
        recent.status === 'fulfilled' ? buildReturnPages(recent.value, 'recent', new Map(), Date.now(), 180) : [],
      )
      setHistoryError(recent.status === 'rejected')
      setBookmarks(saved.status === 'fulfilled' ? saved.value : [])
      setLoading(false)
    })
    const onRemoved = (event: chrome.history.RemovedResult) => {
      cancelled = true
      setLoading(false)
      const removed = new Set((event.urls ?? []).map(normalizePageUrl))
      setHistory(items => (event.allHistory ? [] : items.filter(item => !removed.has(normalizePageUrl(item.url)))))
    }
    chrome.history.onVisitRemoved.addListener(onRemoved)
    return () => {
      cancelled = true
      chrome.history.onVisitRemoved.removeListener(onRemoved)
    }
  }, [open, host, settings.showBookmarksInQuickUrlMenu, settings.bookmarkFolderId])

  const seen = new Set<string>()
  const unique = (items: ReturnPage[]) =>
    items.filter(item => {
      const normalized = normalizePageUrl(item.url)
      if (!normalized || seen.has(normalized) || !matches(item.url)) return false
      seen.add(normalized)
      return true
    })
  // Actual tabs stay separate, even for the same page, so each close action has one target.
  const opened = settings.showOpenTabsInQuickUrlMenu
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
  const saved = unique([
    ...quickUrls
      .filter(item => normalizePageUrl(item.url) !== normalizePageUrl(url))
      .map(item => ({ ...item, lastVisitTime: 0, activeDays: 0 })),
    ...bookmarks.flatMap(item =>
      item.url && normalizePageUrl(item.url) !== normalizePageUrl(url)
        ? [{ id: item.id, url: item.url, title: item.title || item.url, lastVisitTime: 0, activeDays: 0 }]
        : [],
    ),
  ])
  const recent = unique(history.filter(item => item.lastVisitTime >= getHistoryWindowStart(7)))
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="nt-site-pages-dialog"
        data-testid="site-pages-dialog"
        data-history-view={historyView ? 'true' : 'false'}
        initialFocus={titleRef}
        finalFocus={finalFocus}>
        <DialogTitle
          render={
            <h2 ref={titleRef} tabIndex={-1}>
              {title}
            </h2>
          }
          className="outline-none">
          {title}
        </DialogTitle>
        <DialogDescription>{host}</DialogDescription>
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
      </DialogContent>
    </Dialog>
  )
}
