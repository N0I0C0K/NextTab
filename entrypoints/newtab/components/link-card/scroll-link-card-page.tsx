import { cn } from '@/entrypoints/newtab/lib/utils'
import { type FC } from 'react'
import { DndLinkCardPage } from './dnd-link-card-page'
import { ScrollArea } from '@/components/shared'
import { AddButton } from '@/entrypoints/newtab/components/add-button'

import './scroll-link-card-page.css'

export const ScrollLinkCardPage: FC<{ className?: string; maxRow?: number }> = ({ className, maxRow = 2 }) => {
  return (
    <div className={cn(className, 'duration-300', 'inner-shadow')}>
      <ScrollArea className="w-full" style={{ height: 130 * maxRow }} scrollHideDelay={200}>
        <DndLinkCardPage />
        <AddButton className="absolute bottom-2 right-2" />
      </ScrollArea>
    </div>
  )
}
