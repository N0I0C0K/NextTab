import * as React from 'react'
import { cn } from 'cn'

type StackProps = React.HTMLAttributes<HTMLDivElement> & {
  direction?: 'row' | 'column' | 'rowr' | 'columnr'
  center?: boolean
}

export const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  ({ direction = 'row', center = false, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex',
        direction === 'column' && 'flex-col',
        direction === 'rowr' && 'flex-row-reverse',
        direction === 'columnr' && 'flex-col-reverse',
        center && 'items-center',
        className,
      )}
      {...props}
    />
  ),
)

Stack.displayName = 'Stack'
