import { useEffect, useRef, useState, type RefObject } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, Input } from '@/components/shared'
import { getDisplayQuickUrls, quickUrlItemsStorage, settingStorage } from '@/utils/storage'
import { useStorage } from '@/utils'
import { openSavedUrl, searchQuickLinks } from '@/utils/quick-link-search'
import { t } from '@/utils/i18n'
import { NavigationList, focusNavigationFromSearch } from './navigation-list'

export function QuickLinksDialog({
  query: initialQuery,
  onClose,
  finalFocus,
}: {
  query: string | null
  onClose: () => void
  finalFocus: RefObject<HTMLInputElement>
}) {
  const items = useStorage(quickUrlItemsStorage)
  const settings = useStorage(settingStorage)
  const [query, setQuery] = useState(initialQuery ?? '')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (initialQuery !== null) setQuery(initialQuery)
  }, [initialQuery])
  const matches =
    initialQuery === null ? [] : searchQuickLinks(getDisplayQuickUrls(items, settings.quickUrlSortMode), query)
  return (
    <Dialog
      open={initialQuery !== null}
      onOpenChange={open => {
        if (!open) onClose()
      }}>
      <DialogContent
        className="nt-navigation-dialog"
        data-testid="quick-links-dialog"
        initialFocus={input}
        finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle>{t('commandPluginQuickLinks')}</DialogTitle>
          <DialogDescription>{t('commandPluginQuickLinksDescription')}</DialogDescription>
        </DialogHeader>
        <Input
          ref={input}
          aria-label={t('quickLinksSearchPlaceholder')}
          placeholder={t('quickLinksSearchPlaceholder')}
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={focusNavigationFromSearch}
        />
        <NavigationList
          items={matches}
          resetKey={query}
          onOpen={(item, newTab) => openSavedUrl(item.url, newTab)}
        />
      </DialogContent>
    </Dialog>
  )
}
