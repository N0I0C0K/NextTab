import { useEffect, useState } from 'react'
import { searchEnginesStorage } from '@/utils/storage'
import type { SearchEngine } from '@/utils/search-engines'

export function useSearchEngines() {
  const [value, setValue] = useState<SearchEngine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    let revision = 0
    const unwatch = searchEnginesStorage.watch(next => {
      revision++
      setValue(next)
      setError(false)
      setLoading(false)
    })
    const request = revision
    setLoading(true)
    void searchEnginesStorage.getValue().then(
      next => {
        if (active && request === revision) {
          setValue(next)
          setError(false)
          setLoading(false)
        }
      },
      () => {
        if (active && request === revision) {
          setError(true)
          setLoading(false)
        }
      },
    )
    return () => {
      active = false
      unwatch()
    }
  }, [attempt])
  return { value, loading, error, retry: () => setAttempt(previous => previous + 1) }
}
