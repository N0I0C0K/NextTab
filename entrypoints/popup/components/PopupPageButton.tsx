import { ArrowUpRight, CornerUpRight } from 'lucide-react'
import type { MouseEvent, KeyboardEvent } from 'react'
import { QuickLinkIcon } from '@/components/shared/custom/quick-link-icon'
import { t } from '@/utils/i18n'
import type { PopupPage } from '../popup-pages'
import { popupAction, type PopupModifiers } from '../popup-keyboard'

export function PopupPageButton({
  item,
  tile,
  previewIndex,
  currentWindowId,
  disabled,
  selected,
  listbox,
  total,
  column,
  modifiers,
  onOpen,
}: {
  item: PopupPage
  tile: boolean
  previewIndex: number
  currentWindowId?: number
  disabled: boolean
  selected: boolean
  listbox: boolean
  total: number
  column: number
  modifiers: PopupModifiers
  onOpen: (page: PopupPage, event: MouseEvent | KeyboardEvent) => Promise<void>
}) {
  const isTab = item.tabId !== undefined
  const isHistory = item.id.startsWith('history:')
  const detail = isTab
    ? t(item.windowId === currentWindowId ? 'popupThisWindow' : 'popupOtherWindow')
    : isHistory && item.lastVisitTime
      ? new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(item.lastVisitTime)
      : item.url
  return (
    <button
      type="button"
      id={`popup-result-${encodeURIComponent(item.id)}`}
      role={listbox ? 'option' : 'gridcell'}
      tabIndex={-1}
      aria-selected={selected}
      aria-posinset={listbox ? previewIndex + 1 : undefined}
      aria-setsize={listbox ? total : undefined}
      aria-colindex={listbox ? undefined : column + 1}
      data-popup-result={item.id}
      data-testid={tile ? 'popup-quick-link' : 'popup-page-row'}
      data-preview-index={previewIndex}
      data-popup-index={previewIndex}
      data-modified={selected && (modifiers.ctrlKey || modifiers.metaKey || modifiers.shiftKey)}
      className={tile ? 'popup-quick-link' : 'popup-page-row'}
      title={`${item.title}\n${item.url}`}
      aria-label={item.title}
      aria-describedby={selected ? 'popup-current-action' : undefined}
      disabled={disabled}
      onClick={event => void onOpen(item, event)}>
      <QuickLinkIcon
        url={item.url}
        title={item.title}
        iconUrl={item.iconUrl}
        className={tile ? 'popup-quick-link-icon' : 'popup-row-icon popup-quick-link-icon'}
      />
      {tile ? (
        <span className="popup-quick-link-label">{item.title}</span>
      ) : (
        <>
          <span className="popup-row-copy">
            <span className="popup-row-title">{item.title}</span>
            <span className="popup-row-detail">{detail}</span>
          </span>
          <span className="popup-row-action">
            {isTab && <span className="popup-live-dot" />}
            {selected && <kbd aria-hidden="true">↵</kbd>}
            <span className="popup-row-action-label">
              {t(popupAction(item, selected ? modifiers : { ctrlKey: false, metaKey: false, shiftKey: false }))}
            </span>
            {isTab ? <CornerUpRight size={13} /> : <ArrowUpRight size={13} />}
          </span>
        </>
      )}
    </button>
  )
}
