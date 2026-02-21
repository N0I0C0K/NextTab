import { Button } from '@extension/ui'
import { t } from '@extension/i18n'
import { quickUrlItemsStorage } from '@extension/storage'
import { useStorage } from '@extension/shared'
import { Plus } from 'lucide-react'
import { useCallback, useState, useEffect, useRef } from 'react'
import { nanoid } from 'nanoid'

export const AddCurrentPageButton = () => {
  const [isAdding, setIsAdding] = useState(false)
  const [exactMatch, setExactMatch] = useState(false)
  const [hostMatch, setHostMatch] = useState(false)
  const [added, setAdded] = useState(false)
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const quickUrls = useStorage(quickUrlItemsStorage)

  useEffect(() => {
    return () => {
      if (addedTimerRef.current !== null) {
        clearTimeout(addedTimerRef.current)
      }
    }
  }, [])

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

      await quickUrlItemsStorage.add({
        id: nanoid(),
        title: tab.title,
        url: tab.url,
      })
      setAdded(true)
      addedTimerRef.current = setTimeout(() => setAdded(false), 2000)
    } finally {
      setIsAdding(false)
    }
  }, [isAdding, exactMatch])

  return (
    <div className="flex flex-col items-center">
      <Button
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
      {!exactMatch && !hostMatch && added && (
        <p className="text-xs text-green-600 dark:text-green-500 mt-1">{t('pageAdded')}</p>
      )}
    </div>
  )
}
