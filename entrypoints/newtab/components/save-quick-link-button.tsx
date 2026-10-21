import { useState } from 'react'
import { Check, LoaderCircle, Plus } from 'lucide-react'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'
import { useStorage } from '@/hooks/useStorage'
import { addQuickUrlIfMissing, quickUrlItemsStorage, quickUrlKey } from '@/utils/storage'
import { t } from '@/utils/i18n'

export function SaveQuickLinkButton({ title, url }: { title: string; url: string }) {
  const links = useStorage(quickUrlItemsStorage)
  const [saving, setSaving] = useState(false)
  const saved = links.some(item => quickUrlKey(item.url) === quickUrlKey(url))
  const label = t(saved ? 'quickLinkSaved' : 'addToQuickLinks')
  return (
    <button
      type="button"
      className="nt-save-quick-link"
      data-testid="save-quick-link"
      aria-label={label}
      title={label}
      aria-disabled={saved || saving}
      onMouseDown={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
      }}
      onKeyUp={event => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
      }}
      onClick={event => {
        event.preventDefault()
        event.stopPropagation()
        if (saved || saving) return
        setSaving(true)
        void addQuickUrlIfMissing({ id: nanoid(), title: title || url, url })
          .then(added => toast.success(t(added ? 'quickLinkAdded' : 'quickLinkSaved')))
          .catch(() => toast.error(t('quickLinkAddFailed')))
          .finally(() => setSaving(false))
      }}>
      {saved ? (
        <Check size={15} aria-hidden="true" />
      ) : saving ? (
        <LoaderCircle size={15} aria-hidden="true" />
      ) : (
        <Plus size={15} aria-hidden="true" />
      )}
    </button>
  )
}
