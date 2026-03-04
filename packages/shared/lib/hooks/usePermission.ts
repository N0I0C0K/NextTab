import { useState, useEffect, useCallback } from 'react'
import { hasPermission, requestPermission } from '../utils/permissions'

/**
 * Hook to check and manage permission status for optional host permissions
 */
export const usePermission = (origins: string[]) => {
  const [isGranted, setIsGranted] = useState<boolean>()
  const [isRequesting, setIsRequesting] = useState(false)

  useEffect(() => {
    hasPermission(origins).then(setIsGranted)
  }, [origins])

  const request = useCallback(async () => {
    setIsRequesting(true)
    try {
      const granted = await requestPermission(origins)
      setIsGranted(granted)
      return granted
    } finally {
      setIsRequesting(false)
    }
  }, [origins])

  const refresh = useCallback(async () => {
    const granted = await hasPermission(origins)
    setIsGranted(granted)
    return granted
  }, [origins])

  return { isGranted, isRequesting, request, refresh }
}
