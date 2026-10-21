import { useEffect, useRef, useState, type FC } from 'react'
import { Plus } from 'lucide-react'
import { nanoid } from 'nanoid'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/shared'
import { addQuickUrlIfMissing, quickUrlItemsStorage } from '@/utils/storage'
import { useStorage } from '@/hooks/useStorage'
import { t } from '@/utils/i18n'
import { QuickItemEditForm, type IAddQuickUrlItemShema } from './quick-item-edit-form'
import { selectQuickLinkSuggestions } from '../services/quick-link-suggestions'

function AddSiteForm({ onAdded }: { onAdded: () => void }) {
  const saved = useStorage(quickUrlItemsStorage)
  const [sites, setSites] = useState<chrome.topSites.MostVisitedURL[]>([])
  const [loading, setLoading] = useState(true)
  const [submitError, setSubmitError] = useState<string>()
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    let cancelled = false
    // Optional recommendations never prevent manual input. Drop delayed results after close/deletion.
    const onRemoved = () => {
      cancelled = true
      setSites([])
      setLoading(false)
    }
    void (chrome.topSites?.get ? chrome.topSites.get() : Promise.resolve([])).then(
      result => {
        if (!cancelled) {
          setSites(result)
          setLoading(false)
        }
      },
      () => {
        if (!cancelled) setLoading(false)
      },
    )
    chrome.history.onVisitRemoved.addListener(onRemoved)
    return () => {
      mounted.current = false
      cancelled = true
      chrome.history.onVisitRemoved.removeListener(onRemoved)
    }
  }, [])
  const handleSubmit = async (value: IAddQuickUrlItemShema) => {
    setSubmitError(undefined)
    try {
      const added = await addQuickUrlIfMissing({ title: value.title, url: value.url, id: nanoid() })
      if (!mounted.current) return
      if (added) onAdded()
      else setSubmitError(t('quickLinkSaved'))
    } catch {
      if (mounted.current) setSubmitError(t('quickLinkAddFailed'))
    }
  }
  return (
    <QuickItemEditForm
      onSubmit={handleSubmit}
      submitButtonTitle={t('addSite')}
      suggestions={selectQuickLinkSuggestions(sites, saved)}
      suggestionsLoading={loading}
      submitError={submitError}
    />
  )
}

export const AddButton: FC<{ className?: string }> = ({ className }) => {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
        data-testid="add-quick-link">
        <Plus className="mr-1 size-4" aria-hidden="true" /> {t('addSite')}
      </Button>
      <DialogContent
        className="nt-add-site-dialog"
        initialFocus={() => document.querySelector<HTMLInputElement>('.nt-add-site-dialog input[name="title"]')}
        finalFocus={() => document.querySelector<HTMLButtonElement>('[data-testid="add-quick-link"]')}>
        <DialogHeader>
          <DialogTitle>{t('addQuickLinkTitle')}</DialogTitle>
          <DialogDescription>{t('addQuickLinkDescription')}</DialogDescription>
        </DialogHeader>
        <div className="nt-add-site-body">{open && <AddSiteForm onAdded={() => setOpen(false)} />}</div>
      </DialogContent>
    </Dialog>
  )
}
