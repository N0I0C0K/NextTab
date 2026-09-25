import { useStorage } from '@/utils'
import { quickUrlItemsStorage } from '@/utils/storage'
import { t } from '@/utils/i18n'
import { PopupQuickUrlItem } from './PopupQuickUrlItem'

export const PopupQuickUrlGrid = () => {
  const quickUrls = useStorage(quickUrlItemsStorage)

  if (quickUrls.length === 0) {
    return (
      <div className="flex min-h-40 items-center justify-center text-muted-foreground">
        <p className="text-sm">{t('noQuickLinks')}</p>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="quick-url-grid grid">
        {quickUrls.map(item => (
          <PopupQuickUrlItem key={item.id} item={item} />
        ))}
      </div>
      <div className="px-4 pb-4 pt-2">
        <p className="text-xs text-muted-foreground text-center leading-relaxed">{t('popupKeyboardHint')}</p>
      </div>
    </div>
  )
}
