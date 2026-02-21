import { cn } from '@/lib/utils'
import { Loader2, Image as ImageIcon } from 'lucide-react'
import { useState, useEffect, type FC } from 'react'

/**
 * Displays a wallpaper image with skeleton loading and error fallback states.
 * Designed for use inside a relatively-positioned container.
 */
export const WallpaperImage: FC<{
  src: string
  alt: string
  className?: string
}> = ({ src, alt, className }) => {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setIsLoading(true)
    setHasError(false)
  }, [src])

  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <ImageIcon className="size-6 text-muted-foreground" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={cn('aspect-video w-full object-cover', isLoading || hasError ? 'invisible' : 'visible', className)}
        loading="lazy"
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false)
          setHasError(true)
        }}
      />
    </>
  )
}
