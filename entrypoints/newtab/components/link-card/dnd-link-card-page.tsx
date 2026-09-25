import { DragDropProvider, PointerSensor } from '@dnd-kit/react'
import { isSortable } from '@dnd-kit/react/sortable'
import { arrayMove } from '@dnd-kit/helpers'
import { useStorage } from '@/utils'
import { getDisplayQuickUrls, quickUrlItemsStorage, settingStorage, updateStorageItem } from '@/utils/storage'
import { type FC, useRef } from 'react'

import { SortableLinkCardItem } from '@/entrypoints/newtab/components/link-card/link-card-item'
import { cn } from '@/entrypoints/newtab/lib/utils'
import { useKeyboardNavigation } from './use-keyboard-navigation'
import { t } from '@/utils/i18n'

export const DndLinkCardPage: FC<{
  className?: string
}> = ({ className }) => {
  const userStorageItems = useStorage(quickUrlItemsStorage)
  const settings = useStorage(settingStorage)
  const canReorder = (settings.quickUrlSortMode ?? 'manual') === 'manual'
  const displayItems = getDisplayQuickUrls(userStorageItems, settings.quickUrlSortMode ?? 'manual')
  const containerRef = useRef<HTMLDivElement>(null)

  const { selectedIndex } = useKeyboardNavigation({
    items: displayItems,
    enabled: true, // Always enabled
    containerRef,
  })

  return (
    <DragDropProvider
      sensors={[
        PointerSensor.configure({
          activationConstraints: event =>
            event.pointerType === 'touch' ? { delay: { tolerance: 5, value: 250 } } : { distance: { value: 5 } },
        }),
      ]}
      onDragEnd={async event => {
        if (!canReorder) return
        const { source } = event.operation
        if (isSortable(source)) {
          const { initialIndex, index } = source.sortable
          if (initialIndex !== index) {
            await updateStorageItem(quickUrlItemsStorage, pre => {
              return arrayMove(pre, initialIndex, index)
            })
          }
        }
      }}>
      <div ref={containerRef} data-testid="quick-link-grid" className={cn('nt-links-grid', className)}>
        {displayItems.length === 0 && (
          <p className="col-span-full py-6 text-center text-sm text-muted-foreground">{t('emptyQuickLinks')}</p>
        )}
        {displayItems.map((val, index) => (
          <SortableLinkCardItem
            {...val}
            key={val.id}
            index={index}
            canReorder={canReorder}
            selected={selectedIndex === index}
          />
        ))}
      </div>
    </DragDropProvider>
  )
}
