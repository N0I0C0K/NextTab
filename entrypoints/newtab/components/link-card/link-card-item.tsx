import { useCallback, useRef, useState, type FC, type KeyboardEvent, type MouseEvent } from 'react'
import { useSortable } from '@dnd-kit/react/sortable'
import { arrayMove } from '@dnd-kit/helpers'
import { ChevronDown, GripVertical } from 'lucide-react'
import { cn } from '@/entrypoints/newtab/lib/utils'
import { quickUrlItemsStorage, settingStorage, updateStorageItem, type QuickUrlItem } from '@/utils/storage'
import { useStorage } from '@/utils'
import { t } from '@/utils/i18n'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/shared/ui/context-menu'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/shared'
import { useGlobalDialog } from '@/entrypoints/newtab/providers'
import { LinkCardIcon } from './link-card-icon'
import { LinkCardContextMenuContent } from './link-card-context-menu'
import { useRelatedBookmarks } from './use-related-bookmarks'
import { useDomainRecommendations } from './use-domain-recommendations'
import { SitePagesDialog } from './site-pages-dialog'
import { normalizePageUrl } from '../../services/return-pages'

interface LinkCardProps extends QuickUrlItem {
  index: number
  selected?: boolean
  canReorder?: boolean
  className?: string
  tabs?: chrome.tabs.Tab[]
}

export const SortableLinkCardItem: FC<LinkCardProps> = ({
  url,
  title,
  id,
  index,
  className,
  selected = false,
  canReorder = true,
  tabs = [],
}) => {
  const { ref, handleRef } = useSortable({ id, index, disabled: !canReorder })
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [siteOpen, setSiteOpen] = useState(false)
  const expandRef = useRef<HTMLButtonElement>(null)
  const canExpand = normalizePageUrl(url) !== null
  const settings = useStorage(settingStorage)
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    /* Imported links may be malformed. */
  }
  const relatedTabs = settings.showOpenTabsInQuickUrlMenu
    ? tabs.filter(tab => {
        try {
          return new URL(tab.url ?? tab.pendingUrl ?? '').hostname === host
        } catch {
          return false
        }
      })
    : []
  const openCount = relatedTabs.length
  const globalDialog = useGlobalDialog()

  const { relatedBookmarks, showBookmarks } = useRelatedBookmarks(url, contextMenuOpen)
  const recommendedPages = useDomainRecommendations(url, contextMenuOpen, relatedBookmarks, relatedTabs)
  const handleOpen = useCallback(
    (ev: MouseEvent<HTMLButtonElement>) => {
      if (ev.ctrlKey || ev.metaKey) {
        chrome.tabs.create({ url, active: true })
      } else {
        chrome.tabs.update({ url })
      }
    },
    [url],
  )

  const handleMoveByKeyboard = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const direction =
        event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? 1
            : 0
      if (!direction || !canReorder) return
      event.preventDefault()
      event.stopPropagation()
      void updateStorageItem(quickUrlItemsStorage, items => {
        const currentIndex = items.findIndex(item => item.id === id)
        const nextIndex = currentIndex + direction
        return nextIndex < 0 || nextIndex >= items.length ? items : arrayMove(items, currentIndex, nextIndex)
      })
    },
    [id, canReorder],
  )

  return (
    <>
      <ContextMenu onOpenChange={setContextMenuOpen}>
        <ContextMenuTrigger
          render={
            <div
              ref={ref}
              className={cn('nt-link', className)}
              data-testid="quick-link-card"
              data-quick-link-id={id}
              data-selected={selected ? 'true' : 'false'}
              aria-current={selected ? 'true' : undefined}
            />
          }>
          <Tooltip disabled={siteOpen || contextMenuOpen}>
            <TooltipTrigger
              delay={350}
              render={
                <button type="button" className="nt-link-open" aria-label={`${title} — ${url}`} onClick={handleOpen} />
              }>
              <LinkCardIcon url={url} title={title} />
              <span className="nt-link-copy">
                <span className="nt-link-label">{title}</span>
                <span className="nt-link-meta" data-open-tabs={openCount > 0 || undefined}>
                  {openCount ? t(openCount === 1 ? 'siteOneOpenTab' : 'siteOpenCount', String(openCount)) : host}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {title} · {t('siteOpenHome')}
            </TooltipContent>
          </Tooltip>
          {canExpand && (
            <Tooltip disabled={siteOpen || contextMenuOpen}>
              <TooltipTrigger
                delay={250}
                render={
                  <button
                    ref={expandRef}
                    type="button"
                    className="nt-link-expand"
                    aria-label={t('expandSitePages', title)}
                    aria-expanded={siteOpen}
                    aria-haspopup="dialog"
                    onClick={() => setSiteOpen(true)}
                  />
                }>
                <ChevronDown size={15} aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>{t('expandSitePages', title)}</TooltipContent>
            </Tooltip>
          )}
          {canReorder && (
            <button
              ref={handleRef}
              type="button"
              className="nt-link-grip"
              data-testid="quick-link-drag-handle"
              aria-label={`Reorder ${title}. Drag or use arrow keys.`}
              onKeyDown={handleMoveByKeyboard}>
              <GripVertical size={16} aria-hidden="true" />
            </button>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-72 max-w-[calc(100vw-24px)]">
          <LinkCardContextMenuContent
            id={id}
            title={title}
            url={url}
            relatedBookmarks={relatedBookmarks}
            showBookmarks={showBookmarks}
            relatedTabs={relatedTabs}
            showOpenTabs={settings.showOpenTabsInQuickUrlMenu}
            recommendedPages={recommendedPages}
            globalDialog={globalDialog}
          />
        </ContextMenuContent>
      </ContextMenu>
      <SitePagesDialog
        url={url}
        title={title}
        tabs={tabs}
        open={siteOpen}
        onOpenChange={setSiteOpen}
        finalFocus={expandRef}
      />
    </>
  )
}

export const LinkCardItem = SortableLinkCardItem
