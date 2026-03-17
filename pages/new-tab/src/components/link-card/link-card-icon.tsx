import { getDefaultIconUrl } from '@/lib/url'
import { cn } from '@/lib/utils'
import type { MouseEventHandler } from 'react'
import { forwardRef } from 'react'

interface LinkCardIconProps {
  url: string
  onClick: MouseEventHandler<HTMLDivElement>
}

/**
 * LinkCardIcon - The clickable icon/image component for a link card
 */
export const LinkCardIcon = forwardRef<HTMLDivElement, LinkCardIconProps>(({ url, onClick }, ref) => {
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
      <img src={getDefaultIconUrl(url)} alt="img" className="size-8 rounded-md select-none" />
    </div>
  )
})

LinkCardIcon.displayName = 'LinkCardIcon'
