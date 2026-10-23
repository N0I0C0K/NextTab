import { useLayoutEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactElement } from 'react'
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

/** cmdk keeps focus in its input, so route the menu shortcut to its selected link. */
export function openSelectedQuickLinkMenu(event: KeyboardEvent<HTMLInputElement>) {
  if (
    event.nativeEvent.isComposing ||
    event.nativeEvent.keyCode === 229 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    !(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))
  )
    return false
  const selected = event.currentTarget
    .closest('[cmdk-root]')
    ?.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"][data-slot="context-menu-trigger"]')
  if (!selected) return false
  event.preventDefault()
  event.stopPropagation()
  selected.scrollIntoView({ block: 'nearest' })
  const rect = selected.getBoundingClientRect()
  selected.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }),
  )
  return true
}

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
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const changeOpen = (value: boolean) => {
    setOpen(value)
    onOpenChange?.(value)
  }
  useLayoutEffect(() => {
    if (!open) return
    // Menu autofocus is deferred. Escape can still originate from the owning
    // dialog/input before focus reaches the popup, especially for a saved link.
    const trigger = triggerRef.current
    const scope = trigger?.closest<HTMLElement>('[role="dialog"], [cmdk-root]') ?? trigger
    const dismiss = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return
      if (
        event.target instanceof Element &&
        scope?.matches('[role="dialog"], [cmdk-root]') &&
        event.target.closest('[role="dialog"], [cmdk-root]') !== scope
      )
        return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      onOpenChange?.(false)
    }
    scope?.addEventListener('keydown', dismiss, true)
    return () => scope?.removeEventListener('keydown', dismiss, true)
  }, [open, onOpenChange])
  if (!url) return children
  return (
    <ContextMenu open={open} onOpenChange={changeOpen}>
      <ContextMenuTrigger ref={triggerRef} render={children} />
      <ContextMenuContent
        finalFocus={finalFocus}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}>
        <SaveQuickLinkMenuItem title={title} url={url} />
      </ContextMenuContent>
    </ContextMenu>
  )
}
