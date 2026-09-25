import type { QuickUrlItem } from '@/utils/storage'
import { getDefaultIconUrl } from '@/utils'
import { Globe2 } from 'lucide-react'
import { memo, useCallback, useMemo, useState } from 'react'

interface PopupQuickUrlItemProps {
  item: QuickUrlItem
}

export const PopupQuickUrlItem = memo(({ item }: PopupQuickUrlItemProps) => {
  const { url, title } = item
  const iconUrl = useMemo(() => getDefaultIconUrl(url), [url])
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  const handleClick = useCallback(
    async (ev: React.MouseEvent) => {
      if (ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
        // Shift only: open in new window
        chrome.windows.create({ url, focused: true })
      } else if (ev.ctrlKey || ev.metaKey) {
        if (ev.shiftKey) {
          // Ctrl/Cmd + Shift: open next to current tab
          const currentTabIndex = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          })
          const newTabIndex = currentTabIndex.length > 0 ? currentTabIndex[0].index + 1 : undefined
          chrome.tabs.create({ url, active: true, index: newTabIndex })
        } else {
          // Ctrl/Cmd only: open in new tab
          chrome.tabs.create({ url, active: true })
        }
      } else {
        // Normal click: open in current tab
        chrome.tabs.update({ url })
      }
      window.close()
    },
    [url],
  )

  return (
    <button
      data-testid="popup-quick-link"
      onClick={handleClick}
      aria-label={title}
      title={title}
      className="popup-quick-link">
      <span className="popup-quick-link-icon" aria-hidden="true">
        {failedUrl === url ? (
          <Globe2 className="size-[19px] text-muted-foreground" />
        ) : (
          <img src={iconUrl} alt="" onError={() => setFailedUrl(url)} />
        )}
      </span>
      <span className="popup-quick-link-label">{title}</span>
    </button>
  )
})

PopupQuickUrlItem.displayName = 'PopupQuickUrlItem'
