import { hasPermission, requestPermission } from '@extension/shared'
import { Button, Stack, Text } from '@extension/ui'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { type FC, useCallback, useEffect, useState } from 'react'
import { t } from '@extension/i18n'

interface PermissionGrantProps {
  /** Permission origins to check and request */
  origins: string[]
  /** Description text for the permission */
  description: string
  /** Callback when permission status changes */
  onPermissionChange?: (granted: boolean) => void
  /** Optional className for styling */
  className?: string
}

/**
 * A component that displays a permission grant prompt when permission is not granted.
 * When permission is already granted, it renders nothing (or children if provided).
 */
export const PermissionGrant: FC<PermissionGrantProps> = ({ origins, description, onPermissionChange, className }) => {
  const [isGranted, setIsGranted] = useState<boolean | null>(null)
  const [isRequesting, setIsRequesting] = useState(false)

  // Check permission status on mount
  useEffect(() => {
    hasPermission(origins).then(granted => {
      setIsGranted(granted)
      onPermissionChange?.(granted)
    })
  }, [origins, onPermissionChange])

  const handleRequestPermission = useCallback(async () => {
    setIsRequesting(true)
    try {
      const granted = await requestPermission(origins)
      setIsGranted(granted)
      onPermissionChange?.(granted)
    } finally {
      setIsRequesting(false)
    }
  }, [origins, onPermissionChange])

  // Still checking permission status
  if (isGranted === null) {
    return null
  }

  // Permission already granted, render nothing
  if (isGranted) {
    return null
  }

  // Permission not granted, show prompt
  return (
    <div
      className={`rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 ${className ?? ''}`}
      role="alert"
      aria-live="polite">
      <Stack direction="row" className="items-center justify-between gap-3">
        <Stack direction="row" className="items-center gap-2 flex-1 min-w-0">
          <ShieldAlert className="size-5 text-amber-500 flex-shrink-0" />
          <Text level="s" className="text-amber-700 dark:text-amber-400">
            {description}
          </Text>
        </Stack>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRequestPermission}
          disabled={isRequesting}
          className="flex-shrink-0 border-amber-500/50 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400">
          {isRequesting ? t('loading') : t('grantPermission')}
        </Button>
      </Stack>
    </div>
  )
}

/**
 * A small inline indicator showing permission status (granted)
 */
export const PermissionGrantedIndicator: FC<{ className?: string }> = ({ className }) => {
  return (
    <Stack direction="row" className={`items-center gap-1 ${className ?? ''}`}>
      <ShieldCheck className="size-3.5 text-green-500" />
      <Text level="xs" className="text-green-600 dark:text-green-400">
        {t('permissionGranted')}
      </Text>
    </Stack>
  )
}
