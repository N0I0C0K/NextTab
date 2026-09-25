import { cn } from '@/entrypoints/newtab/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/shared'
import type { LucideProps } from 'lucide-react'
import { type ElementType, type FC, type ReactElement } from 'react'

export const SettingItem: FC<{
  className?: string
  title: string
  description?: string
  control: ReactElement
  IconClass: ElementType<LucideProps>
  additionalControl?: ReactElement
}> = ({ control, title, className, description, IconClass, additionalControl }) => {
  return (
    <div className={cn('nt-setting-item rounded-lg border border-border bg-card', className)}>
      <IconClass className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="nt-setting-copy" data-slot="setting-item-copy">
        <span className="nt-setting-title font-medium" title={title}>
          {title}
        </span>
        {description && (
          <TooltipProvider delay={300}>
            <Tooltip>
              <TooltipTrigger
                render={<button type="button" className="nt-setting-description" aria-label={description} />}>
                <span className="truncate">{description}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-72 text-left leading-relaxed">
                {description}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="nt-setting-control" data-slot="setting-item-control">
        {control}
        {additionalControl && <div className="nt-setting-secondary">{additionalControl}</div>}
      </div>
    </div>
  )
}
