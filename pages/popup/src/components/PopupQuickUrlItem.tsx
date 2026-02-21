import type { QuickUrlItem } from '@extension/storage'
import { Text } from '@extension/ui'
import { getDefaultIconUrl } from '@extension/shared'
import { memo, useCallback } from 'react'

interface PopupQuickUrlItemProps {
  item: QuickUrlItem
}

export const PopupQuickUrlItem = memo(({ item }: PopupQuickUrlItemProps) => {
  const { url, title } = item
  const iconUrl = getDefaultIconUrl(url)

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
      onClick={handleClick}
      aria-label={title}
      className="flex flex-col items-center justify-center gap-1 p-2 rounded-md transition-colors group border-0
        hover:bg-muted cursor-pointer">
      <div className="w-10 h-10 rounded-md overflow-hidden flex items-center justify-center">
        <img
          src={iconUrl}
          alt={title}
          className="w-full h-full object-cover"
          onError={e => {
            const target = e.target as HTMLImageElement
            target.style.display = 'none'
            const parent = target.parentElement
            if (parent) {
              parent.textContent = title.charAt(0).toUpperCase()
              parent.classList.add('text-xl', 'font-semibold', 'text-muted-foreground')
            }
          }}
        />
      </div>
      <Text level="xs" className="text-center line-clamp-2 max-w-full leading-tight select-none">
        {title}
      </Text>
    </button>
  )
})

PopupQuickUrlItem.displayName = 'PopupQuickUrlItem'
