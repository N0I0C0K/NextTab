/* eslint-disable jsx-a11y/no-static-element-interactions */
import { cn } from '@/lib/utils'
import type { QuickUrlItem } from '@extension/storage'
import { Text, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@extension/ui'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@extension/ui/lib/components/ui/context-menu'
import { useGlobalDialog } from '@src/provider'
import type { CSSProperties, MouseEventHandler, Ref, TouchEventHandler } from 'react'
import { useRef, useState, forwardRef, useCallback } from 'react'

import { MakeSortableItem } from '@/src/components/sortable-area'
import { LinkCardIcon } from './link-card-icon'
import { LinkCardTooltipContent } from './link-card-tooltip'
import { LinkCardContextMenuContent } from './link-card-context-menu'
import { useRelatedBookmarks } from './use-related-bookmarks'
import { useRelatedTabs } from './use-related-tabs'

interface LinkCardProps extends QuickUrlItem {
  ref?: Ref<HTMLDivElement>
  selected?: boolean
}

interface CustomGridItemProps {
  onMouseDown?: MouseEventHandler
  onMouseUp?: MouseEventHandler
  onTouchEnd?: TouchEventHandler
  className?: string
  style?: CSSProperties
}

export const LinkCardItem = forwardRef<HTMLDivElement, LinkCardProps & CustomGridItemProps>(
  ({ url, title, id, className, onMouseDown, onMouseUp, onTouchEnd, style, selected = false }, ref) => {
    const [contextMenuOpen, setContextMenuOpen] = useState(false)
    const globalDialog = useGlobalDialog()
    const innerRef = useRef<HTMLDivElement>(null)

    // Fetch related bookmarks when context menu opens
    const { relatedBookmarks, showBookmarks } = useRelatedBookmarks(url, contextMenuOpen)
    // Fetch related open tabs when context menu opens
    const { relatedTabs, showOpenTabs } = useRelatedTabs(url, contextMenuOpen)
    const handleIconClick = useCallback(
      (ev: React.MouseEvent<HTMLDivElement>) => {
        if (ev.ctrlKey || ev.metaKey) {
          chrome.tabs.create({ url: url, active: true })
        } else {
          chrome.tabs.update({ url: url })
        }
      },
      [url],
    )

    return (
      <TooltipProvider>
        <Tooltip>
          <ContextMenu onOpenChange={setContextMenuOpen}>
            <div
              style={style}
              className={cn(
                `relative min-w-[4.5rem] group flex flex-col items-center justify-center overflow-hidden p-2 gap-1
                rounded-md duration-200 cursor-default`,
                selected && 'bg-primary/10',
                className,
              )}
              key={id}
              ref={ref}
              onMouseDown={onMouseDown}
              onMouseUp={onMouseUp}
              onTouchEnd={onTouchEnd}>
              <TooltipTrigger asChild>
                <ContextMenuTrigger>
                  <LinkCardIcon url={url} onClick={handleIconClick} ref={innerRef} />
                </ContextMenuTrigger>
              </TooltipTrigger>
              <Text level="s" className="select-none line-clamp-1">
                {title}
              </Text>
            </div>
            <TooltipContent>
              <LinkCardTooltipContent title={title} url={url} id={id} />
            </TooltipContent>
            <ContextMenuContent className="max-w-xs">
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
        </Tooltip>
      </TooltipProvider>
    )
  },
)

LinkCardItem.displayName = 'LinkCardItem'

export const SortableLinkCardItem = MakeSortableItem(LinkCardItem)
