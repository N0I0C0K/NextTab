import * as React from 'react'
import { useState, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'

/**
 * Extract the first character from a string for fallback display
 * Handles both CJK characters and Latin letters
 */
function getFirstChar(str: string): string {
  if (!str || str.trim().length === 0) return '?'
  const trimmed = str.trim()
  // Get the first grapheme (handles emoji and combined characters)
  const firstChar = trimmed[0]
  return firstChar.toUpperCase()
}

/**
 * Extract domain from URL for fallback when title is empty
 */
function getDomainFirstChar(url: string): string {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.replace(/^www\./, '')
    return getFirstChar(hostname)
  } catch {
    return '?'
  }
}

export interface WebsiteIconProps {
  /** The URL of the website (used to fetch favicon) */
  url: string
  /** The title/name of the website (used for fallback display) */
  title?: string
  /** Icon URL to use (optional, will use Chrome favicon API if not provided) */
  iconUrl?: string
  /** Size of the icon in pixels */
  size?: number
  /** Additional class name for the container */
  className?: string
  /** Class name for the image element */
  imageClassName?: string
  /** Class name for the fallback element */
  fallbackClassName?: string
  /** Alt text for the image */
  alt?: string
}

/**
 * WebsiteIcon - A component that displays a website's favicon with a fallback
 *
 * When the favicon fails to load, it shows:
 * 1. The first character of the title (if provided)
 * 2. The first character of the domain (if title is empty)
 */
export const WebsiteIcon = React.forwardRef<HTMLDivElement, WebsiteIconProps>(
  ({ url, title, iconUrl, size = 32, className, imageClassName, fallbackClassName, alt }, ref) => {
    // Start with showFallback as false - only show fallback after error
    const [showFallback, setShowFallback] = useState(false)

    const handleError = useCallback(() => {
      setShowFallback(true)
    }, [])

    // Reset state when URL changes
    React.useEffect(() => {
      setShowFallback(false)
    }, [url, iconUrl])

    // Generate fallback character
    const fallbackChar = useMemo(() => {
      if (title && title.trim().length > 0) {
        return getFirstChar(title)
      }
      return getDomainFirstChar(url)
    }, [title, url])

    // Generate the favicon URL using Chrome's favicon API
    const faviconUrl = useMemo(() => {
      if (iconUrl) return iconUrl
      try {
        const faviconApiUrl = new URL(chrome.runtime.getURL('/_favicon/'))
        faviconApiUrl.searchParams.set('pageUrl', url)
        faviconApiUrl.searchParams.set('size', '128')
        return faviconApiUrl.toString()
      } catch {
        return ''
      }
    }, [url, iconUrl])

    const sizeStyle = { width: size, height: size }

    return (
      <div
        ref={ref}
        className={cn('relative flex items-center justify-center overflow-hidden rounded-md', className)}
        style={sizeStyle}>
        {/* Fallback - only shown when image fails to load */}
        {showFallback && (
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center font-semibold text-muted-foreground select-none',
              fallbackClassName,
            )}
            style={{ fontSize: size * 0.5 }}>
            {fallbackChar}
          </div>
        )}

        {/* Image - always try to load, hide on error */}
        {!showFallback && faviconUrl && (
          <img
            src={faviconUrl}
            alt={alt || title || 'website icon'}
            className={cn('h-full w-full object-cover', imageClassName)}
            onError={handleError}
          />
        )}
      </div>
    )
  },
)

WebsiteIcon.displayName = 'WebsiteIcon'
