import { cn } from '@/entrypoints/newtab/lib/utils'
import { type FC } from 'react'
import { DndLinkCardPage } from './dnd-link-card-page'
export const ScrollLinkCardPage: FC<{ className?: string; maxRow?: number }> = ({ className }) => {
  return (
    <div className={cn('nt-links-panel', className)}>
      <DndLinkCardPage />
    </div>
  )
}
