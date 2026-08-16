import { cn } from '@extension/ui/lib/utils'
import type { FC } from 'react'

const headingLevelToSizeMapping = {
  h1: 'text-5xl',
  h2: 'text-3xl',
  h3: 'text-2xl',
  h4: 'text-xl',
  h5: 'text-lg',
}

type SupportHeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5'

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: SupportHeadingLevel
  styled?: boolean
}

export const Heading: FC<HeadingProps> = ({ level = 'h3', children, className, styled, ...props }) => {
  return (
    <h1
      className={cn(
        `${headingLevelToSizeMapping[level]} font-bold subpixel-antialiased`,
        className,
        styled ? 'poetsen-one-regular' : '',
      )}
      {...props}>
      {children}
    </h1>
  )
}

type SupportTextLevel = 'xs' | 's' | 'md' | 'lg' | 'xl'

export interface TextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  level?: SupportTextLevel
  gray?: boolean
}

const pLevelToSizeMapping = {
  xs: 'text-xs',
  s: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
}

export const Text: FC<TextProps> = ({ level = 'md', children, className, gray, ...props }) => {
  return (
    <p
      {...props}
      className={cn(
        'font-normal subpixel-antialiased',
        pLevelToSizeMapping[level],
        gray ? 'text-muted-foreground' : '',
        className,
      )}>
      {children}
    </p>
  )
}
