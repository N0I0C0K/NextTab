import { ArrowUpRight, CornerUpRight } from 'lucide-react'
import type { MouseEvent, KeyboardEvent } from 'react'
import { QuickLinkIcon } from '@/components/shared/custom/quick-link-icon'
import { t } from '@/utils/i18n'
import type { PopupPage } from '../popup-pages'

export function PopupPageButton({
  item,
  tile,
  previewIndex,
  currentWindowId,
  disabled,
  onOpen,
}: {
  item: PopupPage
  tile: boolean
  previewIndex: number
  currentWindowId?: number
  disabled: boolean
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
      data-popup-result={item.id}
      data-testid={tile ? 'popup-quick-link' : 'popup-page-row'}
      data-preview-index={previewIndex}
      data-popup-index={previewIndex}
      className={tile ? 'popup-quick-link' : 'popup-page-row'}
      title={`${item.title}\n${item.url}`}
      aria-label={item.title}
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
            {t(isTab ? 'popupSwitch' : isHistory ? 'popupReopen' : 'popupOpen')}
            {isTab ? <CornerUpRight size={13} /> : <ArrowUpRight size={13} />}
          </span>
        </>
      )}
    </button>
  )
}
