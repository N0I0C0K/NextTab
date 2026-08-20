import * as React from 'react'
import type {} from '@radix-ui/react-popover'

import type { ButtonProps } from './button'
import { Button } from './button'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './tooltip'

export const TooltipButton = React.forwardRef<
  HTMLButtonElement,
  ButtonProps & {
    tooltip: React.ReactNode | string
    side?: 'top' | 'right' | 'bottom' | 'left'
  }
>(({ tooltip, side, ...props }, ref) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button ref={ref} {...props} />
        </TooltipTrigger>
        <TooltipContent className="" side={side}>
          {React.isValidElement(tooltip) ? tooltip : <span>{tooltip}</span>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
})
TooltipButton.displayName = 'TooltipButton'
