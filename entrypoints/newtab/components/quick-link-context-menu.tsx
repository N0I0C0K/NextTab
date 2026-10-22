import { useState, type ComponentProps, type ReactElement } from 'react'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'
import { useStorage } from '@/hooks/useStorage'
import { addQuickUrlIfMissing, quickUrlItemsStorage, quickUrlKey } from '@/utils/storage'
import { t } from '@/utils/i18n'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/shared/ui/context-menu'
import { DropdownMenuItem } from '@/components/shared/ui/dropdown-menu'

export function SaveQuickLinkMenuItem({
  title,
  url,
  dropdown = false,
}: {
  title: string
  url: string
  dropdown?: boolean
}) {
  const links = useStorage(quickUrlItemsStorage)
  const [saving, setSaving] = useState(false)
  const saved = links.some(item => quickUrlKey(item.url) === quickUrlKey(url))
  const Item = dropdown ? DropdownMenuItem : ContextMenuItem
  return (
    <Item
      data-testid="save-quick-link"
      disabled={saved || saving}
      onClick={event => {
        event.stopPropagation()
        if (saved || saving) return
        setSaving(true)
        void addQuickUrlIfMissing({ id: nanoid(), title: title || url, url })
          .then(added => toast.success(t(added ? 'quickLinkAdded' : 'quickLinkSaved')))
          .catch(() => toast.error(t('quickLinkAddFailed')))
          .finally(() => setSaving(false))
      }}>
      {t(saved ? 'quickLinkSaved' : 'addToQuickLinks')}
    </Item>
  )
}

/** Reuse the link itself as the trigger, without adding layout or a second button. */
export function QuickLinkContextMenu({
  title,
  url,
  children,
  onOpenChange,
  finalFocus,
}: {
  title: string
  url?: string
  children: ReactElement
  onOpenChange?: (open: boolean) => void
  finalFocus?: ComponentProps<typeof ContextMenuContent>['finalFocus']
}) {
  if (!url) return children
  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent
        finalFocus={finalFocus}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}>
        <SaveQuickLinkMenuItem title={title} url={url} />
      </ContextMenuContent>
    </ContextMenu>
  )
}
