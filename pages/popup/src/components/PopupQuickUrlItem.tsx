import type { QuickUrlItem } from '@extension/storage'
import { Text, WebsiteIcon } from '@extension/ui'
import { memo, useCallback } from 'react'

interface PopupQuickUrlItemProps {
  item: QuickUrlItem
}

export const PopupQuickUrlItem = memo(({ item }: PopupQuickUrlItemProps) => {
  const { url, title } = item

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
      <WebsiteIcon url={url} title={title} size={40} className="rounded-md" />
      <Text level="xs" className="text-center line-clamp-2 max-w-full leading-tight select-none">
        {title}
      </Text>
    </button>
  )
})

PopupQuickUrlItem.displayName = 'PopupQuickUrlItem'
