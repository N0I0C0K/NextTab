import { t } from '@/utils/i18n'
import { addQuickUrlIfMissing, quickUrlKey } from '@/utils/storage/impl/quickUrlStorage'
import type { QuickUrlItem } from '@/utils/storage/base/types'
import { Check, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { nanoid } from 'nanoid'

export const AddCurrentPageButton = ({
  current,
  quickUrls,
}: {
  current?: chrome.tabs.Tab
  quickUrls: QuickUrlItem[]
}) => {
  const [isAdding, setIsAdding] = useState(false)
  const [failed, setFailed] = useState(false)
  const addingRef = useRef(false)
  const url = current?.url ?? current?.pendingUrl
  const exactMatch = Boolean(url && quickUrls.some(item => quickUrlKey(item.url) === quickUrlKey(url)))
  const hostMatch = Boolean(
    url &&
    !exactMatch &&
    quickUrls.some(item => {
      try {
        return new URL(item.url).hostname === new URL(url).hostname
      } catch {
        return false
      }
    }),
  )
  return (
    <div className="popup-save">
      <button
        type="button"
        data-testid="add-current-page"
        disabled={isAdding || exactMatch || !url}
        onClick={async () => {
          if (addingRef.current || !url || exactMatch) return
          addingRef.current = true
          setIsAdding(true)
          setFailed(false)
          try {
            await addQuickUrlIfMissing({ id: nanoid(), title: current?.title || url, url })
          } catch {
            setFailed(true)
          } finally {
            addingRef.current = false
            setIsAdding(false)
          }
        }}>
        {exactMatch ? <Check size={14} /> : <Plus size={14} />}
        {t(exactMatch ? 'popupSaved' : 'popupSaveCurrent')}
      </button>
      {(exactMatch || hostMatch || failed) && (
        <span
          className="popup-save-status"
          role={failed ? 'alert' : 'status'}
          title={t(failed ? 'popupSaveFailed' : exactMatch ? 'pageExists' : 'sameHostExists')}>
          {t(failed ? 'popupSaveFailed' : exactMatch ? 'pageExists' : 'sameHostExists')}
        </span>
      )}
    </div>
  )
}
