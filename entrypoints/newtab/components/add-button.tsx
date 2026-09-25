import { useState, type FC } from 'react'
import { Plus } from 'lucide-react'
import { nanoid } from 'nanoid'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/shared'
import { addQuickUrl } from '@/utils/storage'
import { t } from '@/utils/i18n'
import { QuickItemEditForm, type IAddQuickUrlItemShema } from './quick-item-edit-form'

export const AddButton: FC<{ className?: string }> = ({ className }) => {
  const [open, setOpen] = useState(false)
  const handleSubmit = async (value: IAddQuickUrlItemShema) => {
    await addQuickUrl({ title: value.title, url: value.url, id: nanoid() })
    setOpen(false)
  }

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
      <DialogContent className="w-[calc(100vw-32px)] max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle>{t('addQuickLinkTitle')}</DialogTitle>
          <DialogDescription>{t('addQuickLinkDescription')}</DialogDescription>
        </DialogHeader>
        <QuickItemEditForm onSubmit={handleSubmit} submitButtonTitle={t('addSite')} />
      </DialogContent>
    </Dialog>
  )
}
