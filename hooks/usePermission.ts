import { useState, useEffect, useCallback, useMemo } from 'react'
import { hasPermission, requestPermission } from '../utils/permissions'

const hasRelevantOriginChange = (permissions: chrome.permissions.Permissions, origins: readonly string[]) => {
  return permissions.origins?.some(origin => origins.includes(origin)) ?? false
}

type PermissionChangeListener = (permissions: chrome.permissions.Permissions) => void

const removePermissionListener = (
  event: chrome.permissions.PermissionsAddedEvent | chrome.permissions.PermissionsRemovedEvent,
  listener: PermissionChangeListener,
) => {
  const removableEvent = event as typeof event & {
    removeListener?: (callback: PermissionChangeListener) => void
  }

  removableEvent.removeListener?.(listener)
}

export interface PermissionState {
  isGranted: boolean | null
  isRequesting: boolean
  request: () => Promise<boolean>
  refresh: () => Promise<boolean>
}

/**
 * Hook to check and manage permission status for optional host permissions
 */
export const usePermission = (origins: string[]): PermissionState => {
  const originsKey = [...origins].sort().join('\n')
  const normalizedOrigins = useMemo(() => (originsKey ? originsKey.split('\n') : []), [originsKey])

  const [isGranted, setIsGranted] = useState<boolean | null>(null)
  const [isRequesting, setIsRequesting] = useState(false)

  const refresh = useCallback(async () => {
    const granted = await hasPermission(normalizedOrigins)
    setIsGranted(granted)
    return granted
  }, [normalizedOrigins])

  useEffect(() => {
    let isDisposed = false

    const syncPermissionState = async () => {
      const granted = await hasPermission(normalizedOrigins)
      if (!isDisposed) {
        setIsGranted(granted)
      }
    }

    const handlePermissionChange = (permissions: chrome.permissions.Permissions) => {
      if (!hasRelevantOriginChange(permissions, normalizedOrigins)) {
        return
      }

      void syncPermissionState()
    }

    void syncPermissionState()
    chrome.permissions.onAdded.addListener(handlePermissionChange)
    chrome.permissions.onRemoved.addListener(handlePermissionChange)

    return () => {
      isDisposed = true
      removePermissionListener(chrome.permissions.onAdded, handlePermissionChange)
      removePermissionListener(chrome.permissions.onRemoved, handlePermissionChange)
    }
  }, [normalizedOrigins])

  const request = useCallback(async () => {
    setIsRequesting(true)
    try {
      const granted = await requestPermission(normalizedOrigins)
      setIsGranted(granted)
      return granted
    } finally {
      setIsRequesting(false)
    }
  }, [normalizedOrigins])

  return { isGranted, isRequesting, request, refresh }
}
