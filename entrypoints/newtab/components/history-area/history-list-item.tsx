import { addQuickUrl, removeHistorySuggestionById } from '@/utils/storage'
import { Stack, Text } from '@/components/shared'
import { useMemo, type FC } from 'react'
import { cn } from '@/entrypoints/newtab/lib/utils'
import { getDefaultIconUrl } from '@/entrypoints/newtab/lib/url'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  ContextMenuItemWitchIcon,
} from '@/components/shared/ui/context-menu'
import { Plus, Trash } from 'lucide-react'

export const HistoryListItem: FC<{
  className?: string
  title: string
  url: string
  iconUrl?: string
  id: string
  lastVisitTime?: number
}> = ({ className, title, iconUrl, url, id, lastVisitTime }) => {
  const lastVisitDate = useMemo(() => new Date(lastVisitTime ?? 0), [lastVisitTime])
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Stack
          direction={'row'}
          className={cn(
            'w-full items-center py-1.5 cursor-pointer group',
            'hover:bg-slate-200/10 duration-200',
            className,
          )}
          onClick={ev => {
            if (ev.ctrlKey) {
              chrome.tabs.create({ url: url, active: true })
            } else {
              chrome.tabs.update({ url: url })
            }
          }}>
          <img src={iconUrl ?? getDefaultIconUrl(url)} className="size-5 rounded-md mx-2" alt="list-icon" />
          <Text className="cursor-pointer line-clamp-1">{title}</Text>
          <span className="flex-1" />
          <Text className="invisible group-hover:visible font-thin text-sm">{lastVisitDate.toLocaleDateString()}</Text>
          <span className="w-2" />
        </Stack>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-[16rem]">
        <ContextMenuItemWitchIcon
          IconType={Plus}
          shortCut="Ctrl+A"
          onClick={() => {
            console.log(title)
            addQuickUrl({
              id,
              title,
              url,
            })
            removeHistorySuggestionById(id)
          }}>
          Add to favor
        </ContextMenuItemWitchIcon>
        <ContextMenuItemWitchIcon
          IconType={Trash}
          className="text-red-800"
          shortCut="Ctrl+D"
          onClick={() => {
            removeHistorySuggestionById(id)
          }}>
          Delete
        </ContextMenuItemWitchIcon>
      </ContextMenuContent>
    </ContextMenu>
  )
}
