import './App.css'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { ArrowLeft, ChevronRight, Globe, Keyboard, Search, X } from 'lucide-react'
import { withErrorBoundary, withSuspense } from '@/components/hoc'
import { BrandMark } from '@/components/shared/custom/brand-mark'
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
import { nextPopupIndex, plainModifiers, popupAction } from './popup-keyboard'
import { PopupKeyboardHelp } from './components/PopupKeyboardHelp'

function SectionHeading({
  title,
  count,
  shortcut,
  onAll,
}: {
  title: string
  count: number | string
  shortcut: 1 | 2
  onAll?: () => void
}) {
  return (
    <div className="popup-section-heading">
      <h2>
        {title} <span>{count}</span>
      </h2>
      {onAll && (
        <button type="button" onClick={onAll} aria-keyshortcuts={`Alt+${shortcut}`}>
          {t('returnViewAll')}
          <kbd aria-hidden="true">
            {/Mac/i.test(navigator.userAgent) ? 'Option' : 'Alt'} {shortcut}
          </kbd>
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
  const [help, setHelp] = useState(false)
  const [{ columns, previewRows }, setLayout] = useState({ columns: 4, previewRows: 2 })
  const [modifiers, setModifiers] = useState(plainModifiers)
  const [selection, setSelection] = useState<{ scope: string; id: string | null }>({ scope: 'home:', id: null })
  const previousSelection = useRef({ scope: '', index: -1 })
  const beforeSearch = useRef<{ id: string | null; top: number }>()
  const restorePosition = useRef<number>()
  const composing = useRef(false)
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
  const savedPreview = columns * previewRows
  const items = useMemo(
    () => (fullList ? listed : [...saved.slice(0, savedPreview), ...preview]),
    [fullList, listed, saved, savedPreview, preview],
  )
  const indices = useMemo(() => new Map(items.map((item, index) => [item.id, index])), [items])
  const activeId = selection.scope === pageKey ? selection.id : searching ? items[0]?.id : null
  const activeIndex = indices.get(activeId ?? '') ?? -1
  const active = items[activeIndex]
  const siteError = site.contextError || site.tabsError || site.historyError

  useLayoutEffect(() => {
    let id = selection.scope === pageKey ? selection.id : searching ? (items[0]?.id ?? null) : null
    if (id && !indices.has(id)) {
      const index = previousSelection.current.scope === pageKey ? previousSelection.current.index : 0
      id = items[Math.min(Math.max(0, index), items.length - 1)]?.id ?? null
    }
    if (!id && searching) id = items[0]?.id ?? null
    previousSelection.current = { scope: pageKey, index: indices.get(id ?? '') ?? -1 }
    if (selection.scope !== pageKey || selection.id !== id) setSelection({ scope: pageKey, id })
  }, [items, indices, pageKey, searching, selection])
  useLayoutEffect(() => {
    if (!help) search.current?.focus({ preventScroll: true })
  }, [help])
  useLayoutEffect(() => {
    const element = content.current
    if (!element) return
    const savedHeading = element.querySelector('.popup-section-heading')
    const siteSection = element.querySelector('.popup-site-section')
    const measure = () => {
      const style = getComputedStyle(element)
      const columns = Number(style.getPropertyValue('--popup-columns')) || 4
      let previewRows = 2
      // Wait for the site query before lending its space to saved sites.
      if (!fullList && !site.loading && !siteError && savedHeading) {
        const headingStyle = getComputedStyle(savedHeading)
        const siteHeight = siteSection
          ? siteSection.getBoundingClientRect().height + parseFloat(getComputedStyle(siteSection).marginTop)
          : 0
        const available =
          element.clientHeight -
          parseFloat(style.paddingTop) -
          parseFloat(style.paddingBottom) -
          savedHeading.getBoundingClientRect().height -
          parseFloat(headingStyle.marginBottom) -
          siteHeight
        const step = Number(style.getPropertyValue('--popup-grid-step')) || 50
        previewRows = Math.max(2, Math.floor((available + 6) / step))
      }
      setLayout(previous => {
        const rows = fullList || site.loading ? previous.previewRows : previewRows
        return previous.columns === columns && previous.previewRows === rows ? previous : { columns, previewRows: rows }
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    if (savedHeading) observer.observe(savedHeading)
    if (siteSection) observer.observe(siteSection)
    return () => observer.disconnect()
  }, [fullList, site.loading, siteError, host])
  useLayoutEffect(() => {
    if (!fullList && activeId)
      document.getElementById(`popup-result-${encodeURIComponent(activeId)}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeId, fullList, columns])
  useLayoutEffect(() => {
    // Search restoration takes precedence over revealing an offscreen selection.
    if (content.current) content.current.scrollTop = restorePosition.current ?? 0
    restorePosition.current = undefined
  }, [pageKey])

  const changeQuery = (value: string) => {
    if (!searching && value.trim())
      beforeSearch.current = { id: active?.id ?? null, top: content.current?.scrollTop ?? 0 }
    if (!value) {
      restorePosition.current = beforeSearch.current?.top ?? 0
      setSelection({ scope: `${view}:`, id: beforeSearch.current?.id ?? null })
      beforeSearch.current = undefined
    }
    setOpenError(false)
    setQuery(value)
  }

  const open = async (item: PopupPage, event: Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>) => {
    if (openingRef.current) return
    openingRef.current = true
    setSelection({ scope: pageKey, id: item.id })
    search.current?.focus({ preventScroll: true })
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
      selected={item.id === active?.id}
      listbox={searching}
      total={items.length}
      column={tile ? index % columns : 0}
      modifiers={modifiers}
      onOpen={open}
    />
  )
  const show = (next: 'home' | 'saved' | 'site') => {
    setView(next)
    setQuery('')
    setSelection({ scope: `${next}:`, id: null })
    beforeSearch.current = undefined
    restorePosition.current = undefined
    if (content.current) content.current.scrollTop = 0
    setOpenError(false)
    search.current?.focus({ preventScroll: true })
  }
  const handleKeys = (event: KeyboardEvent) => {
    if (event.isComposing || composing.current || event.keyCode === 229) return
    setModifiers(previous =>
      previous.ctrlKey === event.ctrlKey && previous.metaKey === event.metaKey && previous.shiftKey === event.shiftKey
        ? previous
        : { ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey },
    )
    if (help) return
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      // Physical digit codes also work when Option changes the character on macOS.
      const digit = event.code === 'Digit1' || event.code === 'Digit2' ? event.code.slice(-1) : event.key
      if (digit === '1' || (digit === '2' && host)) {
        event.preventDefault()
        if (!openingRef.current) show(digit === '1' ? 'saved' : 'site')
        return
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (query) changeQuery('')
      else if (view !== 'home') show('home')
      else window.close()
      search.current?.focus()
      return
    }
    if (event.target !== search.current || event.altKey) return
    if (event.key === 'Enter') {
      event.preventDefault()
      if (active) void open(active, event)
      return
    }
    if (event.ctrlKey || event.metaKey) return
    const gridCount =
      !searching && view !== 'site' ? (fullList ? items.length : Math.min(savedPreview, saved.length)) : 0
    const keys = [
      'ArrowDown',
      'ArrowUp',
      'PageUp',
      'PageDown',
      ...(!searching ? ['Home', 'End'] : []),
      ...(gridCount && activeIndex >= 0 && activeIndex < gridCount ? ['ArrowLeft', 'ArrowRight'] : []),
    ]
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const step = content.current
      ? Number(
          getComputedStyle(content.current).getPropertyValue(gridCount ? '--popup-grid-step' : '--popup-row-step'),
        ) || 52
      : 52
    const index = nextPopupIndex(
      event.key,
      activeIndex,
      items.length,
      gridCount,
      columns,
      Math.floor((content.current?.clientHeight ?? 400) / step),
    )
    setSelection({ scope: pageKey, id: items[index]?.id ?? null })
    if (fullList) scrollList.current?.scrollToItem(index)
  }
  useEffect(() => {
    const element = container.current
    if (!element) return
    element.addEventListener('keydown', handleKeys)
    const keyUp = (event: KeyboardEvent) =>
      setModifiers(previous =>
        previous.ctrlKey === event.ctrlKey && previous.metaKey === event.metaKey && previous.shiftKey === event.shiftKey
          ? previous
          : { ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey },
      )
    const reset = () => setModifiers(plainModifiers)
    element.addEventListener('keyup', keyUp)
    window.addEventListener('blur', reset)
    return () => {
      element.removeEventListener('keydown', handleKeys)
      element.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', reset)
    }
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
          listbox={searching}
          activeIndex={activeIndex}
          scroll={content}
          renderItem={result}
        />
        {!listed.length && (
          <p className="popup-empty">{t(site.loading && view === 'site' ? 'loading' : 'noResultsFound')}</p>
        )}
        {searching && !listed.length && (
          <p className="popup-search-scope">{t(host ? 'popupSearchScopeHost' : 'popupSearchScopeSaved', host ?? '')}</p>
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
            shortcut={1}
            onAll={saved.length > savedPreview ? () => show('saved') : undefined}
          />
          <div className="popup-preview-grid" role="rowgroup">
            {Array.from({ length: Math.ceil(Math.min(saved.length, savedPreview) / columns) }, (_, row) => (
              <div role="row" aria-rowindex={row + 1} className="quick-url-grid" key={row}>
                {saved
                  .slice(row * columns, Math.min((row + 1) * columns, savedPreview))
                  .map((item, index) => result(item, true, row * columns + index))}
              </div>
            ))}
          </div>
          {!saved.length && <p className="popup-empty">{t('noQuickLinks')}</p>}
        </section>
        {host && (
          <section className="popup-site-section" aria-label={t('popupCurrentSite')}>
            <SectionHeading
              title={t('popupCurrentHost', host)}
              count={siteError || site.loading ? '—' : sitePages.length}
              shortcut={2}
              onAll={sitePages.length > 4 ? () => show('site') : undefined}
            />
            <div role="rowgroup">
              {preview.map((item, index) => (
                <div
                  role="row"
                  aria-rowindex={Math.ceil(Math.min(saved.length, savedPreview) / columns) + index + 1}
                  key={item.id}>
                  {result(item, false, Math.min(saved.length, savedPreview) + index)}
                </div>
              ))}
            </div>
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
          <BrandMark />
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
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup={searching ? 'listbox' : 'grid'}
          aria-expanded="true"
          aria-controls="popup-results"
          aria-activedescendant={active ? `popup-result-${encodeURIComponent(active.id)}` : undefined}
          aria-describedby="popup-current-action"
          value={query}
          onChange={event => changeQuery(event.target.value)}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={() => {
            composing.current = false
          }}
          placeholder={t('popupSearchPlaceholder')}
          aria-label={t('popupSearchPlaceholder')}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              changeQuery('')
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
        id="popup-results"
        role={searching ? 'listbox' : 'grid'}
        aria-rowcount={
          searching
            ? undefined
            : fullList
              ? view === 'saved'
                ? Math.ceil(items.length / columns)
                : items.length
              : Math.ceil(Math.min(saved.length, savedPreview) / columns) + preview.length
        }
        aria-colcount={searching ? undefined : view === 'site' ? 1 : columns}
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
      <footer className="popup-footer">
        <div className="popup-action-preview">
          <span title={active?.url}>
            {active?.url || t(host ? 'popupSearchScopeHost' : 'popupSearchScopeSaved', host ?? '')}
          </span>
          <span id="popup-current-action" role="status">
            {active ? (
              <>
                <kbd>Enter</kbd>
                {t(popupAction(active, modifiers))}
              </>
            ) : (
              t(items.length ? 'popupStartSelection' : 'noResultsFound')
            )}
          </span>
        </div>
        <div className="popup-toolbar">
          <AddCurrentPageButton current={site.current} quickUrls={quickUrls} />
          <span className="popup-keyboard-hint">
            {t(searching ? 'popupSearchKeyboardHint' : 'popupNavigationHint')}
          </span>
          <button
            type="button"
            className="popup-help-button"
            onClick={() => setHelp(true)}
            aria-label={t('popupKeyboardHelp')}>
            <Keyboard size={16} />
          </button>
        </div>
      </footer>
      {help && <PopupKeyboardHelp onClose={() => setHelp(false)} />}
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
