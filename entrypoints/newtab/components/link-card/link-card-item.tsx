import { useCallback, useState, type FC, type KeyboardEvent, type MouseEvent } from 'react'
import { useSortable } from '@dnd-kit/react/sortable'
import { arrayMove } from '@dnd-kit/helpers'
import { GripVertical } from 'lucide-react'
import { cn } from '@/entrypoints/newtab/lib/utils'
import { quickUrlItemsStorage, updateStorageItem, type QuickUrlItem } from '@/utils/storage'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/shared/ui/context-menu'
import { useGlobalDialog } from '@/entrypoints/newtab/providers'
import { LinkCardIcon } from './link-card-icon'
import { LinkCardContextMenuContent } from './link-card-context-menu'
import { useRelatedBookmarks } from './use-related-bookmarks'
import { useRelatedTabs } from './use-related-tabs'

interface LinkCardProps extends QuickUrlItem {
  index: number
  selected?: boolean
  canReorder?: boolean
  className?: string
}

export const SortableLinkCardItem: FC<LinkCardProps> = ({
  url,
  title,
  id,
  index,
  className,
  selected = false,
  canReorder = true,
}) => {
  const { ref, handleRef } = useSortable({ id, index, disabled: !canReorder })
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const globalDialog = useGlobalDialog()

  const { relatedBookmarks, showBookmarks } = useRelatedBookmarks(url, contextMenuOpen)
  const { relatedTabs, showOpenTabs } = useRelatedTabs(url, contextMenuOpen)
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
        <button type="button" className="nt-link-open" aria-label={`${title} — ${url}`} onClick={handleOpen}>
          <LinkCardIcon url={url} title={title} />
          <span className="nt-link-label">{title}</span>
        </button>
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
          showOpenTabs={showOpenTabs}
          globalDialog={globalDialog}
        />
      </ContextMenuContent>
    </ContextMenu>
  )
}

export const LinkCardItem = SortableLinkCardItem
