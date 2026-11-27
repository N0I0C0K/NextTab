import { useEffect, useState } from 'react'
import { getFaviconInitial, resolveFaviconUrl } from '@/utils/favicon'

interface QuickLinkIconProps {
  url: string
  title: string
  className: string
  iconUrl?: string
}

export function QuickLinkIcon(props: QuickLinkIconProps) {
  // A new page or supplied icon gets a fresh load/error lifecycle.
  return <ResolvedQuickLinkIcon key={`${props.url}\0${props.iconUrl ?? ''}`} {...props} />
}

function ResolvedQuickLinkIcon({ url, title, className, iconUrl }: QuickLinkIconProps) {
  const [resolved, setResolved] = useState<{ src: string | null } | null>(null)
  const [failedSources, setFailedSources] = useState<string[]>([])
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const preferIcon = Boolean(iconUrl && !failedSources.includes(iconUrl))

  useEffect(() => {
    if (preferIcon) return
    let active = true
    void resolveFaviconUrl(url, failedSources).then(src => {
      if (active) setResolved({ src })
    })
    return () => {
      active = false
    }
  }, [url, preferIcon, failedSources])

  const candidate = preferIcon ? iconUrl : resolved?.src
  const src = candidate && !failedSources.includes(candidate) ? candidate : null
  const status = src ? (loadedSrc === src ? 'loaded' : 'loading') : resolved ? 'fallback' : 'loading'

  return (
    <span className={className} data-icon-status={status} aria-hidden="true">
      {src ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSources(previous => (previous.includes(src) ? previous : [...previous, src]))}
        />
      ) : (
        <span className="text-base font-semibold leading-none text-muted-foreground">{getFaviconInitial(title)}</span>
      )}
    </span>
  )
}
