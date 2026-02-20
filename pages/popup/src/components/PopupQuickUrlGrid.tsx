import { useStorage } from '@extension/shared'
import { quickUrlItemsStorage } from '@extension/storage'
import { t } from '@extension/i18n'
import { PopupQuickUrlItem } from './PopupQuickUrlItem'

export const PopupQuickUrlGrid = () => {
  const quickUrls = useStorage(quickUrlItemsStorage)

  if (quickUrls.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">{t('noQuickLinks')}</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="grid gap-1 p-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))' }}>
        {quickUrls.map(item => (
          <PopupQuickUrlItem key={item.id} item={item} />
        ))}
      </div>
      <div className="mt-3 p-2 border-t border-border">
        <p className="text-xs text-muted-foreground text-center leading-relaxed">{t('popupKeyboardHint')}</p>
      </div>
    </div>
  )
}
