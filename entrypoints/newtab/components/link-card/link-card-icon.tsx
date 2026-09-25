import { getDefaultIconUrl } from '@/entrypoints/newtab/lib/url'
import { Globe2 } from 'lucide-react'
import { useMemo, useState } from 'react'

interface LinkCardIconProps {
  url: string
}

export const LinkCardIcon = ({ url }: LinkCardIconProps) => {
  const faviconUrl = useMemo(() => getDefaultIconUrl(url), [url])
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  return (
    <span className="nt-link-icon" aria-hidden="true">
      {failedUrl === url ? (
        <Globe2 className="nt-link-fallback-icon" />
      ) : (
        <img src={faviconUrl} alt="" onError={() => setFailedUrl(url)} />
      )}
    </span>
  )
}
