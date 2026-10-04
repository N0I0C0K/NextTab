import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Info, Search } from 'lucide-react'
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/shared'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/shared/ui/tabs'
import { useStorage } from '@/utils'
import { returnPagePreferencesStorage, returnPageSourceStorage } from '@/utils/storage'
import { t } from '@/utils/i18n'
import { useReturnPages } from '../../hooks/useReturnPages'
import {
  filterReturnPages,
  groupPageTabs,
  normalizePageUrl,
  logReturnPageDisplay,
  type ReturnPageSource,
} from '../../services/return-pages'
import { PageRow } from './page-row'
import { PageList } from './page-list'
import { EventExportButton } from './event-export-button'

type LoadingLayout = { rowHeights: number[]; panelHeight: number; footerHeight: number }

const sourceMessages = {
  recent: { title: 'returnRecent', rules: 'returnRecentRules', empty: 'returnRecentEmpty' },
  frequent: { title: 'returnFrequent', rules: 'returnFrequentRules', empty: 'returnFrequentEmpty' },
  history: { title: 'returnHistory', rules: 'returnHistoryRules', empty: 'returnHistoryEmpty' },
} as const

export function ReturnPagesSection({ tabs }: { tabs: chrome.tabs.Tab[] }) {
  const savedSource = useStorage(returnPageSourceStorage)
  const [source, setSource] = useState<ReturnPageSource>(savedSource)
  const { pages: snapshot, loading, refreshing, error } = useReturnPages(source)
  const preferences = useStorage(returnPagePreferencesStorage)
  const pages = useMemo(() => filterReturnPages(snapshot, preferences, source), [snapshot, preferences, source])
  const tabsByPage = useMemo(() => groupPageTabs(tabs, source === 'history'), [tabs, source])
  const [visibleCount, setVisibleCount] = useState(4)
  const [query, setQuery] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [loadingLayout, setLoadingLayout] = useState<LoadingLayout | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const candidates = pages.slice(0, 4)

  useEffect(() => {
    if (!loading && !refreshing && !error) logReturnPageDisplay(source, snapshot, preferences, visibleCount)
  }, [source, snapshot, preferences, visibleCount, loading, refreshing, error])

  useLayoutEffect(() => {
    const section = sectionRef.current
    // A source switch keeps the last visible layout until the replacement is ready.
    // Initial loading still uses the normal viewport fitting below.
    if (!section || (loading && loadingLayout)) return
    let frame = 0
    const fit = () => {
      const rows = [...section.querySelectorAll<HTMLElement>('[data-home-return-row]')]
      if (!rows.length) return
      const siteHeading = document.querySelector<HTMLElement>('.nt-links-section > .nt-section-heading')
      const firstSite = document.querySelector<HTMLElement>('.nt-links-grid > .nt-link')
      const linksSection = document.querySelector<HTMLElement>('.nt-links-section')
      const panel = section.querySelector<HTMLElement>('.nt-return-pages')!
      const more = section.querySelector<HTMLElement>('[data-return-footer]')
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const headingHeight = siteHeading?.getBoundingClientRect().height ?? 32
      const cardHeight = firstSite?.getBoundingClientRect().height ?? 64
      const linksMargin = linksSection ? parseFloat(getComputedStyle(linksSection).marginTop) : 27
      const headingMargin = siteHeading ? parseFloat(getComputedStyle(siteHeading).marginBottom) : 12
      const moreMargin = more ? parseFloat(getComputedStyle(more).marginTop) : 0
      // Measure all candidates in their real width. Hidden rows keep layout in this measuring layer.
      const budget =
        viewportHeight -
        (panel.getBoundingClientRect().top + window.scrollY) -
        (more?.getBoundingClientRect().height ?? 0) -
        moreMargin -
        linksMargin -
        headingHeight -
        headingMargin -
        cardHeight -
        24 -
        10
      let height = 0
      let count = 0
      for (const row of rows) {
        const next = row.getBoundingClientRect().height
        if (count > 0 && height + next > budget) break
        height += next
        count++
      }
      // Never remove a row the user is currently interacting with.
      const focusedIndex = rows.findIndex(
        row => row.contains(document.activeElement) || row.querySelector('[data-interacting="true"]'),
      )
      setVisibleCount(Math.min(4, Math.max(1, count, focusedIndex + 1)))
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(section)
    const heading = document.querySelector('.nt-links-section > .nt-section-heading')
    if (heading) observer.observe(heading)
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    fit()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
    }
  }, [pages, source, loading, loadingLayout])

  const status = error ? t('returnHistoryError') : t(sourceMessages[source].empty)
  const skeletonHeights = loadingLayout?.rowHeights ?? Array<number | undefined>(4).fill(undefined)
  const allPages = pages.filter(page =>
    `${page.title} ${page.url}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )
  return (
    <section
      ref={sectionRef}
      className="nt-return-section"
      aria-labelledby="nt-return-title"
      data-testid="return-pages-section">
      <Tabs
        value={source}
        onValueChange={value => {
          if (value === source) return
          const panel = sectionRef.current?.querySelector<HTMLElement>('.nt-return-pages')
          const footer = sectionRef.current?.querySelector<HTMLElement>('[data-return-footer]')
          if (panel) {
            const rowHeights = [
              ...panel.querySelectorAll<HTMLElement>('[data-home-return-row][data-visible="true"]'),
            ].map(row => row.getBoundingClientRect().height)
            setLoadingLayout({
              rowHeights: rowHeights.length ? rowHeights : [panel.getBoundingClientRect().height - 10],
              panelHeight: panel.getBoundingClientRect().height,
              footerHeight: footer?.getBoundingClientRect().height ?? 0,
            })
          }
          setSource(value as ReturnPageSource)
          void returnPageSourceStorage.setValue(value as ReturnPageSource)
          setQuery('')
        }}
        className="nt-return-tabs">
        <div className="nt-section-heading">
          <h2 id="nt-return-title">{t('returnPagesHeading')}</h2>
          <div className="nt-return-heading-actions">
            {(import.meta.env.DEV || import.meta.env.MODE === 'test') && <EventExportButton />}
            <TabsList aria-label={t('returnPagesHeading')}>
              {(['recent', 'frequent', 'history'] as const).map(value => (
                <Tooltip key={value}>
                  <TabsTrigger value={value} render={<TooltipPrimitive.Trigger delay={350} />}>
                    {t(sourceMessages[value].title)}
                  </TabsTrigger>
                  <TooltipContent>{t(sourceMessages[value].rules)}</TooltipContent>
                </Tooltip>
              ))}
            </TabsList>
          </div>
        </div>
        <TabsContent value={source} className="nt-return-content">
          <div
            className="nt-return-pages"
            aria-busy={loading || refreshing}
            style={loading && loadingLayout ? { height: loadingLayout.panelHeight } : undefined}>
            {loading ? (
              <>
                <span className="sr-only" role="status">
                  {t('loading')}
                </span>
                {skeletonHeights.map((height, index) => (
                  <div
                    key={index}
                    data-home-return-row
                    data-visible={loadingLayout || index < visibleCount ? 'true' : 'false'}
                    className="nt-return-measured-row nt-return-skeleton-row"
                    style={{ height }}
                    aria-hidden="true">
                    <span className="nt-return-skeleton nt-link-icon" />
                    <span className="nt-return-copy">
                      <span className="nt-return-skeleton nt-return-skeleton-title" />
                      <span className="nt-return-skeleton nt-return-skeleton-meta" />
                    </span>
                  </div>
                ))}
              </>
            ) : candidates.length ? (
              candidates.map((page, index) => (
                <div
                  key={page.id}
                  data-home-return-row
                  data-visible={index < visibleCount ? 'true' : 'false'}
                  className="nt-return-measured-row"
                  aria-hidden={index >= visibleCount || undefined}>
                  <PageRow
                    page={page}
                    tabs={tabs}
                    matchingTabs={tabsByPage.get(source === 'history' ? page.url : normalizePageUrl(page.url)!) ?? []}
                    frequent={source === 'frequent'}
                    exactUrl={source === 'history'}
                    feedback={source !== 'history'}
                  />
                </div>
              ))
            ) : (
              <p className="nt-return-empty" role="status">
                {status}
              </p>
            )}
          </div>
          {error && pages.length > 0 && (
            <p className="nt-return-refresh-error" role="status">
              {t('returnRefreshFailed')}
            </p>
          )}
          {loading && (!loadingLayout || loadingLayout.footerHeight > 0) && (
            <div
              className="nt-view-all nt-return-skeleton-footer"
              data-return-footer
              style={loadingLayout ? { height: loadingLayout.footerHeight } : undefined}
              aria-hidden="true">
              <span className="nt-return-skeleton" />
            </div>
          )}
          {!loading && pages.length > 0 && (
            <Dialog
              onOpenChange={open => {
                if (open) setQuery('')
                setRulesOpen(false)
              }}>
              <DialogTrigger
                render={
                  <button type="button" className="nt-view-all" data-testid="return-view-all" data-return-footer />
                }>
                {t('returnViewAll')} <ArrowRight size={14} aria-hidden="true" />
              </DialogTrigger>
              <DialogContent
                className="nt-return-all-dialog"
                initialFocus={() => document.querySelector<HTMLInputElement>('.nt-return-all-dialog input')}>
                <div className="nt-return-dialog-heading">
                  <DialogTitle>{t(sourceMessages[source].title)}</DialogTitle>
                  <Tooltip open={rulesOpen} onOpenChange={setRulesOpen}>
                    <TooltipTrigger
                      delay={250}
                      closeOnClick={false}
                      render={
                        <button type="button" className="nt-return-info" aria-label={t('returnSelectionRules')} />
                      }
                      onClick={() => setRulesOpen(true)}>
                      <Info size={16} aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start" className="nt-return-rules">
                      <p>{t(sourceMessages[source].rules)}</p>
                      {source !== 'history' && <p>{t('returnCommonRules')}</p>}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <DialogDescription className="sr-only">{t('returnAllDescription')}</DialogDescription>
                <div className="nt-return-search">
                  <Search size={16} aria-hidden="true" />
                  <Input
                    aria-label={t('searchPlaceholder')}
                    placeholder={t('searchPlaceholder')}
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                  />
                </div>
                <div className="nt-return-all-list">
                  {allPages.length ? (
                    <PageList
                      key={query}
                      pages={allPages}
                      tabs={tabs}
                      frequent={source === 'frequent'}
                      exactUrl={source === 'history'}
                      feedback={source !== 'history'}
                    />
                  ) : (
                    <p className="nt-return-empty" role="status">
                      {t('noHistoryFound')}
                    </p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>
      </Tabs>
    </section>
  )
}
