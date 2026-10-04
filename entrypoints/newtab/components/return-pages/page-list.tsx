import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { t } from '@/utils/i18n'
import { groupPageTabs, normalizePageUrl, type ReturnPage } from '../../services/return-pages'
import { PageRow } from './page-row'

const PAGE_SIZE = 20

/** Bound mounted menus/dialogs; searching still uses every candidate in the parent. */
export function PageList({
  pages,
  tabs,
  frequent = false,
  feedback = false,
  exactUrl = false,
  onTabClosed,
}: {
  pages: (ReturnPage & { tabId?: number })[]
  tabs: chrome.tabs.Tab[]
  frequent?: boolean
  feedback?: boolean
  exactUrl?: boolean
  onTabClosed?: (tabId: number) => void
}) {
  const [offset, setOffset] = useState(0)
  const tabsByPage = useMemo(() => groupPageTabs(tabs, exactUrl), [tabs, exactUrl])
  const list = useRef<HTMLDivElement>(null)
  const focusFirst = useRef(false)
  const start = Math.min(offset, Math.max(0, Math.ceil(pages.length / PAGE_SIZE) - 1) * PAGE_SIZE)
  const end = Math.min(start + PAGE_SIZE, pages.length)
  useLayoutEffect(() => {
    if (!focusFirst.current) return
    focusFirst.current = false
    const scroll = list.current?.closest('.nt-return-all-list, .nt-site-pages-body')
    if (scroll) scroll.scrollTop = 0
    list.current?.querySelector<HTMLButtonElement>('.nt-return-open')?.focus()
  }, [start])
  const move = (next: number) => {
    focusFirst.current = true
    setOffset(next)
  }
  return (
    <div ref={list} data-page-list data-total-pages={pages.length}>
      {pages.slice(start, end).map(page => (
        <PageRow
          key={page.id}
          page={page}
          tabs={tabs}
          matchingTabs={tabsByPage.get(exactUrl ? page.url : normalizePageUrl(page.url)!) ?? []}
          exactUrl={exactUrl}
          frequent={frequent}
          feedback={feedback}
          tabId={page.tabId}
          onTabClosed={onTabClosed}
        />
      ))}
      {pages.length > PAGE_SIZE && (
        <nav className="nt-return-pagination" aria-label={t('returnPagination')}>
          <span role="status">{t('returnPageRange', [String(start + 1), String(end), String(pages.length)])}</span>
          <button
            type="button"
            disabled={start === 0}
            aria-label={t('returnPreviousPage')}
            onClick={() => move(start - PAGE_SIZE)}>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={end === pages.length}
            aria-label={t('returnNextPage')}
            onClick={() => move(start + PAGE_SIZE)}>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  )
}
