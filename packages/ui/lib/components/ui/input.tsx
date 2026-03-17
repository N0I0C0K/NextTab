import * as React from 'react'

import { cn } from '@/lib/utils'
import { useDebounce } from '@extension/shared'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
          `text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium
          file:text-foreground placeholder:text-muted-foreground`,
          `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
          disabled:cursor-not-allowed disabled:opacity-50 md:text-sm duration-200`,
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

const DelayInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<'input'> & {
    onValueDelayChange?: (value: string) => void
    delay?: number
  }
>(({ className, type, onValueDelayChange, delay = 300, ...props }, ref) => {
  const [value, setValue] = React.useState('')
  const delayedValue = useDebounce(value, delay)

  React.useEffect(() => {
    onValueDelayChange?.(delayedValue)
  }, [delayedValue, onValueDelayChange])

  return (
    <Input
      type={type}
      className={className}
      ref={ref}
      {...props}
      value={value}
      onChange={e => {
        setValue(e.target.value)
      }}
    />
  )
})
DelayInput.displayName = 'DelayInput'

export { Input }
