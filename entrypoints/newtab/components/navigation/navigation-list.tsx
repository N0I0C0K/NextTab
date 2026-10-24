import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { toast } from 'sonner'
import { QuickLinkIcon } from '@/components/shared/custom/quick-link-icon'
import { t } from '@/utils/i18n'

const OPEN_SELECTOR = '.nt-navigation-open, .nt-return-open'

export type NavigationItem = { id: string; title: string; url: string; detail?: string; tabId?: number }

export function focusNavigationFromSearch(event: KeyboardEvent<HTMLInputElement>) {
  if (
    event.nativeEvent.isComposing ||
    event.nativeEvent.keyCode === 229 ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const rows = event.currentTarget.closest('[role="dialog"]')?.querySelectorAll<HTMLButtonElement>(OPEN_SELECTOR)
  const row = event.key === 'ArrowDown' ? rows?.[0] : rows?.[(rows?.length ?? 0) - 1]
  if (row) {
    event.preventDefault()
    row.focus({ preventScroll: true })
    row.scrollIntoView({ block: 'nearest' })
  }
}

export function NavigationList({
  items,
  resetKey,
  onOpen,
  onClose,
  emptyText,
  unknown = false,
  renderItem,
  footerAction,
}: {
  items: NavigationItem[]
  resetKey: string
  onOpen: (item: NavigationItem, newTab: boolean) => Promise<void>
  onClose?: (item: NavigationItem) => Promise<void>
  emptyText?: ReactNode
  unknown?: boolean
  renderItem?: (item: NavigationItem, actions: { close: () => Promise<void>; closing: boolean }) => ReactNode
  footerAction?: ReactNode
}) {
  const [page, setPage] = useState({ key: resetKey, offset: 0 })
  const [closing, setClosing] = useState<string>()
  const closingRef = useRef(false)
  const list = useRef<HTMLDivElement>(null)
  const firstAfterPage = useRef(false)
  const afterClose = useRef<number>()
  const start = Math.min(page.key === resetKey ? page.offset : 0, Math.max(0, Math.ceil(items.length / 20) - 1) * 20)
  const end = Math.min(start + 20, items.length)
  useLayoutEffect(() => {
    setPage(previous =>
      previous.key === resetKey && previous.offset === start ? previous : { key: resetKey, offset: start },
    )
    if (list.current) list.current.scrollTop = 0
    if (firstAfterPage.current) list.current?.querySelector<HTMLButtonElement>(OPEN_SELECTOR)?.focus()
    firstAfterPage.current = false
  }, [start, resetKey])
  useLayoutEffect(() => {
    if (afterClose.current === undefined || closing !== undefined) return
    const rows = list.current?.querySelectorAll<HTMLButtonElement>(OPEN_SELECTOR)
    const index = Math.min(Math.max(0, afterClose.current - start), (rows?.length ?? 0) - 1)
    if (index >= 0) rows?.[index].focus()
    else list.current?.closest('[role="dialog"]')?.querySelector<HTMLInputElement>('input')?.focus()
    afterClose.current = undefined
  }, [items, closing, start])
  const move = (offset: number) => {
    firstAfterPage.current = true
    setPage({ key: resetKey, offset })
  }
  const openItem = (item: NavigationItem, newTab: boolean) =>
    void onOpen(item, newTab).catch(() => toast.error(t('returnOpenFailed')))
  const closeItem = async (item: NavigationItem, position: number) => {
    if (closingRef.current) throw new Error('Tab close already in progress')
    closingRef.current = true
    setClosing(item.id)
    afterClose.current = position
    try {
      await onClose?.(item)
    } finally {
      closingRef.current = false
      setClosing(undefined)
    }
  }
  const handleRowKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const rows = [...(list.current?.querySelectorAll<HTMLButtonElement>(OPEN_SELECTOR) ?? [])]
    const index = rows.findIndex(row => row.closest('.nt-navigation-row')?.contains(event.currentTarget))
    if (index < 0) return
    event.preventDefault()
    if (event.key === 'ArrowUp' && index === 0) {
      list.current?.closest('[role="dialog"]')?.querySelector<HTMLInputElement>('input')?.focus()
      return
    }
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : index + (event.key === 'ArrowUp' ? -1 : 1)
    const row = rows[Math.min(rows.length - 1, Math.max(0, next))]
    row?.focus({ preventScroll: true })
    row?.scrollIntoView({ block: 'nearest' })
  }
  return (
    <div className="nt-navigation-body" data-testid="navigation-list" data-total={items.length}>
      <div className="nt-navigation-scroll" ref={list}>
        {items.slice(start, end).map((item, index) => (
          <div
            className="nt-navigation-row"
            role="presentation"
            key={item.id}
            data-testid="navigation-row"
            data-item-id={item.id}
            data-tab-id={renderItem ? undefined : item.tabId}
            onKeyDown={
              renderItem
                ? event => {
                    if (
                      event.key === 'Enter' &&
                      (event.ctrlKey || event.metaKey) &&
                      !event.nativeEvent.isComposing &&
                      event.nativeEvent.keyCode !== 229 &&
                      (event.target as HTMLElement).matches('.nt-return-open')
                    ) {
                      event.preventDefault()
                      openItem(item, true)
                    } else handleRowKeyDown(event)
                  }
                : undefined
            }>
            {renderItem ? (
              renderItem(item, { close: () => closeItem(item, start + index), closing: closing !== undefined })
            ) : (
              <button
                type="button"
                className="nt-navigation-open"
                onKeyDown={event => {
                  if (
                    event.key === 'Enter' &&
                    (event.ctrlKey || event.metaKey) &&
                    !event.nativeEvent.isComposing &&
                    event.nativeEvent.keyCode !== 229
                  ) {
                    event.preventDefault()
                    openItem(item, true)
                  } else handleRowKeyDown(event)
                }}
                title={`${item.title}\n${item.url}${item.detail ? '\n' + item.detail : ''}`}
                onClick={event => openItem(item, event.ctrlKey || event.metaKey)}>
                <QuickLinkIcon url={item.url} title={item.title} className="nt-link-icon" />
                <span className="nt-navigation-copy">
                  <span className="nt-navigation-title">{item.title}</span>
                  <span className="nt-navigation-url">{item.url}</span>
                  {item.detail && <span className="nt-navigation-detail">{item.detail}</span>}
                </span>
                <span className="nt-navigation-action">
                  {t(item.tabId === undefined ? 'returnOpenPage' : 'returnSwitchTab')}
                </span>
              </button>
            )}
            {onClose && item.tabId !== undefined && (
              <button
                type="button"
                className="nt-navigation-close"
                onKeyDown={handleRowKeyDown}
                disabled={closing !== undefined}
                aria-label={t('navigationCloseNamedTab', item.title)}
                onClick={() => void closeItem(item, start + index).catch(() => toast.error(t('returnCloseTabFailed')))}>
                <X size={16} />
              </button>
            )}
          </div>
        ))}
        {!items.length && !unknown && <p className="nt-return-empty">{emptyText ?? t('noResultsFound')}</p>}
      </div>
      <nav
        className="nt-navigation-pagination"
        data-single-page={items.length <= 20 || undefined}
        aria-label={t('returnPagination')}>
        <span role="status">
          {unknown
            ? '—'
            : t('returnPageRange', [String(items.length ? start + 1 : 0), String(end), String(items.length)])}
        </span>
        <div>
          <button type="button" disabled={!start} aria-label={t('returnPreviousPage')} onClick={() => move(start - 20)}>
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            disabled={end >= items.length}
            aria-label={t('returnNextPage')}
            onClick={() => move(start + 20)}>
            <ChevronRight size={16} />
          </button>
          {footerAction}
        </div>
      </nav>
    </div>
  )
}
