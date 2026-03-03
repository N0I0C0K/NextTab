import { cn } from '@/lib/utils'
import { WebsiteIcon } from '@extension/ui'
import type { MouseEventHandler } from 'react'
import { forwardRef } from 'react'

interface LinkCardIconProps {
  url: string
  title?: string
  onClick: MouseEventHandler<HTMLDivElement>
}

/**
 * LinkCardIcon - The clickable icon/image component for a link card
 */
export const LinkCardIcon = forwardRef<HTMLDivElement, LinkCardIconProps>(({ url, title, onClick }, ref) => {
  return (
    <div
      className={cn(
        `relative flex flex-row items-center justify-center rounded-lg size-[4.5rem] text-primary duration-200
        select-none cursor-pointer`,
        'hover:bg-slate-200/40 active:bg-slate-100/70',
        'dark:hover:bg-slate-100/20 dark:active:bg-slate-200/70',
      )}
      onClick={onClick}
      aria-hidden="true"
      ref={ref}>
      <WebsiteIcon url={url} title={title} size={32} className="select-none" />
    </div>
  )
})

LinkCardIcon.displayName = 'LinkCardIcon'
