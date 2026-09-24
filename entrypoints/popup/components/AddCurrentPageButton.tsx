import { Button } from '@/components/shared'
import { t } from '@/utils/i18n'
import { addQuickUrl, quickUrlItemsStorage } from '@/utils/storage'
import { useStorage } from '@/utils'
import { Plus } from 'lucide-react'
import { useCallback, useState, useEffect } from 'react'
import { nanoid } from 'nanoid'

export const AddCurrentPageButton = () => {
  const [isAdding, setIsAdding] = useState(false)
  const [exactMatch, setExactMatch] = useState(false)
  const [hostMatch, setHostMatch] = useState(false)
  const quickUrls = useStorage(quickUrlItemsStorage)

  useEffect(() => {
    const checkCurrentPage = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.url) {
        try {
          const currentUrl = new URL(tab.url)
          const currentHost = currentUrl.hostname

          // Check for exact match
          const hasExactMatch = quickUrls.some(item => item.url === tab.url)
          setExactMatch(hasExactMatch)

          // Check for host match (only if no exact match)
          if (!hasExactMatch) {
            const hasHostMatch = quickUrls.some(item => {
              try {
                const itemUrl = new URL(item.url)
                return itemUrl.hostname === currentHost
              } catch {
                return false
              }
            })
            setHostMatch(hasHostMatch)
          } else {
            setHostMatch(false)
          }
        } catch {
          setExactMatch(false)
          setHostMatch(false)
        }
      }
    }
    checkCurrentPage()
  }, [quickUrls])

  const handleAddCurrentPage = useCallback(async () => {
    if (isAdding || exactMatch) return

    setIsAdding(true)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.url || !tab?.title) return

      await addQuickUrl({
        id: nanoid(),
        title: tab.title,
        url: tab.url,
      })
    } finally {
      setIsAdding(false)
    }
  }, [isAdding, exactMatch])

  return (
    <div className="flex flex-col items-center">
      <Button
        data-testid="add-current-page"
        variant="ghost"
        size="sm"
        onClick={handleAddCurrentPage}
        disabled={isAdding || exactMatch}
        className="gap-2">
        <Plus className="w-4 h-4" />
        {t('addCurrentPage')}
      </Button>
      {exactMatch && <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">{t('pageExists')}</p>}
      {!exactMatch && hostMatch && (
        <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">{t('sameHostExists')}</p>
      )}
    </div>
  )
}
