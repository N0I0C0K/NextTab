import { useState } from 'react'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'
import { useStorage } from '@/hooks/useStorage'
import { addQuickUrlIfMissing, quickUrlItemsStorage, quickUrlKey } from '@/utils/storage'
import { t } from '@/utils/i18n'
import { DropdownMenuItem } from '@/components/shared/ui/dropdown-menu'

export function SaveQuickLinkMenuItem({ title, url }: { title: string; url: string }) {
  const links = useStorage(quickUrlItemsStorage)
  const [saving, setSaving] = useState(false)
  const saved = links.some(item => quickUrlKey(item.url) === quickUrlKey(url))
  return (
    <DropdownMenuItem
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
    </DropdownMenuItem>
  )
}
