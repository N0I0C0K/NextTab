import './App.css'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { ArrowLeft, ChevronRight, Globe, Search, X } from 'lucide-react'
import { withErrorBoundary, withSuspense } from '@/components/hoc'
import { useStorage } from '@/hooks/useStorage'
import { getDisplayQuickUrls, quickUrlItemsStorage } from '@/utils/storage/impl/quickUrlStorage'
import { settingStorage } from '@/utils/storage/impl/settingsStorage'
import { matchesSearch, searchQuickLinks } from '@/utils/quick-link-search'
import { t } from '@/utils/i18n'
import { AddCurrentPageButton } from './components/AddCurrentPageButton'
import { PopupPageButton } from './components/PopupPageButton'
import { PopupScrollList, type PopupScrollListHandle } from './components/PopupScrollList'
import { buildPopupSitePages, openPopupPage, popupHost, previewPopupSitePages, type PopupPage } from './popup-pages'
import { usePopupSite } from './usePopupSite'

function SectionHeading({ title, count, onAll }: { title: string; count: number | string; onAll?: () => void }) {
  return (
    <div className="popup-section-heading">
      <h2>
        {title} <span>{count}</span>
      </h2>
      {onAll && (
        <button type="button" onClick={onAll}>
          {t('returnViewAll')}
          <ChevronRight size={12} />
        </button>
      )}
    </div>
  )
}

const Popup = () => {
  const quickUrls = useStorage(quickUrlItemsStorage)
  const settings = useStorage(settingStorage)
  const site = usePopupSite()
  const { current: currentTab, tabs, history } = site
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'home' | 'saved' | 'site'>('home')
  const [openError, setOpenError] = useState(false)
  const [opening, setOpening] = useState(false)
  const openingRef = useRef(false)
  const search = useRef<HTMLInputElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLElement>(null)
  const scrollList = useRef<PopupScrollListHandle>(null)
  const host = popupHost(site.current?.url ?? site.current?.pendingUrl)
  const saved = useMemo(
    () =>
      getDisplayQuickUrls(quickUrls, settings.quickUrlSortMode ?? 'manual').map(item => ({
        ...item,
        id: `saved:${item.id}`,
      })),
    [quickUrls, settings.quickUrlSortMode],
  )
  const { opened, recent } = useMemo(() => buildPopupSitePages(currentTab, tabs, history), [currentTab, tabs, history])
  const sitePages = useMemo(() => [...opened, ...recent], [opened, recent])
  const preview = useMemo(() => previewPopupSitePages(opened, recent), [opened, recent])
  const searching = Boolean(query.trim())
  const listed = useMemo<PopupPage[]>(
    () =>
      searching
        ? [...sitePages.filter(item => matchesSearch(query, item.title, item.url)), ...searchQuickLinks(saved, query)]
        : view === 'saved'
          ? saved
          : sitePages,
    [searching, query, saved, sitePages, view],
  )
  const pageKey = `${view}:${query}`
  const fullList = searching || view !== 'home'
  const resultsById = useMemo(
    () => new Map<string, PopupPage>([...saved, ...sitePages].map(item => [item.id, item])),
    [saved, sitePages],
  )
  const siteError = site.contextError || site.tabsError || site.historyError

  useLayoutEffect(() => {
    if (content.current) content.current.scrollTop = 0
  }, [pageKey])

  const open = async (item: PopupPage, event: Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>) => {
    if (openingRef.current) return
    openingRef.current = true
    setOpening(true)
    setOpenError(false)
    try {
      await openPopupPage(item, site.current, event)
      window.close()
    } catch {
      setOpenError(true)
      if (item.tabId !== undefined) site.retry()
    } finally {
      openingRef.current = false
      setOpening(false)
    }
  }
  const result = (item: PopupPage, tile = false, index = 0) => (
    <PopupPageButton
      key={item.id}
      item={item}
      tile={tile}
      previewIndex={index}
      currentWindowId={site.current?.windowId}
      disabled={opening}
      onOpen={open}
    />
  )
  const show = (next: 'home' | 'saved' | 'site') => {
    setView(next)
    setQuery('')
    search.current?.focus()
  }
  const handleKeys = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229 || event.altKey) return
    if (event.key === 'Escape') {
      if (query || view !== 'home') {
        event.preventDefault()
        setQuery('')
        setView('home')
        search.current?.focus()
      } else window.close()
      return
    }
    const buttons = [...(content.current?.querySelectorAll<HTMLButtonElement>('[data-popup-result]') ?? [])].filter(
      button => button.getClientRects().length > 0,
    )
    const current = buttons.indexOf(event.target as HTMLButtonElement)
    const targetIndex = fullList && current >= 0 ? Number(buttons[current].dataset.popupIndex) : current
    const itemCount = fullList ? listed.length : buttons.length
    if (event.key === 'Enter' && (event.target === search.current || current >= 0)) {
      const id = buttons[Math.max(0, current)]?.dataset.popupResult
      const item = fullList ? listed[Math.max(0, targetIndex)] : id ? resultsById.get(id) : undefined
      if (item) {
        event.preventDefault()
        void open(item, event)
      }
      return
    }
    if (event.ctrlKey || event.metaKey || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    if (event.target !== search.current && current < 0) return
    if (event.target === search.current && ['Home', 'End'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'ArrowUp' && targetIndex === 0) {
      search.current?.focus()
      return
    }
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? itemCount - 1
          : targetIndex < 0
            ? event.key === 'ArrowDown'
              ? 0
              : itemCount - 1
            : Math.min(itemCount - 1, targetIndex + (event.key === 'ArrowDown' ? 1 : -1))
    if (fullList) {
      scrollList.current?.focusItem(index)
      return
    }
    buttons[index]?.focus({ preventScroll: true })
    buttons[index]?.scrollIntoView({ block: 'nearest' })
  }
  useEffect(() => {
    const element = container.current
    if (!element) return
    element.addEventListener('keydown', handleKeys)
    return () => element.removeEventListener('keydown', handleKeys)
  })
  let body: ReactNode
  if (fullList) {
    body = (
      <>
        <PopupScrollList
          key={pageKey}
          ref={scrollList}
          items={listed}
          tiles={!searching && view === 'saved'}
          scroll={content}
          renderItem={result}
        />
        {!listed.length && (
          <p className="popup-empty">{t(site.loading && view === 'site' ? 'loading' : 'noResultsFound')}</p>
        )}
      </>
    )
  } else {
    body = (
      <>
        <section aria-label={t('quickLinksHeading')}>
          <SectionHeading
            title={t('quickLinksHeading')}
            count={saved.length}
            onAll={saved.length > 6 ? () => show('saved') : undefined}
          />
          <div className="quick-url-grid popup-preview-grid">
            {saved.slice(0, 8).map((item, index) => result(item, true, index))}
          </div>
          {!saved.length && <p className="popup-empty">{t('noQuickLinks')}</p>}
        </section>
        {host && (
          <section className="popup-site-section" aria-label={t('popupCurrentSite')}>
            <SectionHeading
              title={t('popupCurrentHost', host)}
              count={siteError || site.loading ? '—' : sitePages.length}
              onAll={sitePages.length > 4 ? () => show('site') : undefined}
            />
            {preview.map(item => result(item))}
            {!preview.length && (
              <p className="popup-empty">
                {t(site.loading ? 'loading' : siteError ? 'popupSiteLoadFailed' : 'popupNoSitePages')}
              </p>
            )}
          </section>
        )}
      </>
    )
  }
  return (
    <div className="popup-container" ref={container} data-view={view}>
      <header className="popup-header">
        <div className="nt-brand">
          <span className="nt-brand-mark" aria-hidden="true" />
          <span>NextTab</span>
        </div>
        {host && (
          <span className="popup-current-host" title={host}>
            <Globe size={14} />
            {host}
          </span>
        )}
      </header>
      <div className="popup-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={search}
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t('popupSearchPlaceholder')}
          aria-label={t('popupSearchPlaceholder')}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              search.current?.focus()
            }}
            aria-label={t('clearSearch')}>
            <X size={16} />
          </button>
        )}
      </div>
      {fullList && (
        <div className="popup-list-heading">
          {!searching && (
            <button type="button" onClick={() => show('home')}>
              <ArrowLeft size={14} />
              {t('popupBack')}
            </button>
          )}
          <h2>
            {searching ? t('popupSearchResults') : view === 'saved' ? t('quickLinksHeading') : host}
            <span role="status">{listed.length}</span>
          </h2>
        </div>
      )}
      <main
        className="popup-content"
        ref={content}
        aria-label={t('popupPages')}
        aria-busy={site.loading}
        data-total={fullList ? listed.length : saved.length + sitePages.length}>
        {body}
      </main>
      {siteError && (
        <div className="popup-notice" role="status">
          <span>{t('popupSiteLoadFailed')}</span>
          <button type="button" onClick={site.retry} disabled={site.loading}>
            {t('retryAction')}
          </button>
        </div>
      )}
      {openError && (
        <p className="popup-open-error" role="alert">
          {t('returnOpenFailed')}
        </p>
      )}
      <footer className="popup-toolbar">
        <AddCurrentPageButton current={site.current} quickUrls={quickUrls} />
        <span className="popup-keyboard-hint">{t('popupNavigationHint')}</span>
      </footer>
    </div>
  )
}

const Failed = () => (
  <div className="popup-fallback">
    <p>{t('popupLoadFailed')}</p>
    <button type="button" onClick={() => location.reload()}>
      {t('retryAction')}
    </button>
  </div>
)
export default withErrorBoundary(withSuspense(Popup, <div className="popup-fallback">{t('loading')}</div>), <Failed />)
