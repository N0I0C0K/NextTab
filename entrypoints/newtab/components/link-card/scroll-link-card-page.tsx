import { cn } from '@/entrypoints/newtab/lib/utils'
import { type FC } from 'react'
import { DndLinkCardPage } from './dnd-link-card-page'
export const ScrollLinkCardPage: FC<{ className?: string; maxRow?: number; tabs?: chrome.tabs.Tab[] }> = ({
  className,
  tabs = [],
}) => {
  return (
    <div className={cn('nt-links-panel', className)}>
      <DndLinkCardPage tabs={tabs} />
    </div>
  )
}
