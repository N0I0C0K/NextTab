import { useEffect, useState } from 'react'
import { getFaviconInitial, resolveFaviconUrl } from '@/utils/favicon'

interface QuickLinkIconProps {
  url: string
  title: string
  className: string
}

export function QuickLinkIcon({ url, title, className }: QuickLinkIconProps) {
  const [resolved, setResolved] = useState<{ url: string; src: string | null } | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void resolveFaviconUrl(url).then(src => {
      if (active) setResolved({ url, src })
    })
    return () => {
      active = false
    }
  }, [url])

  const src = resolved?.url === url ? resolved.src : null
  const status = resolved?.url === url ? (src && failedSrc !== src ? 'loaded' : 'fallback') : 'loading'

  return (
    <span className={className} data-icon-status={status} aria-hidden="true">
      {src && failedSrc !== src ? (
        <img src={src} alt="" onError={() => setFailedSrc(src)} />
      ) : (
        <span className="text-base font-semibold leading-none text-muted-foreground">{getFaviconInitial(title)}</span>
      )}
    </span>
  )
}
