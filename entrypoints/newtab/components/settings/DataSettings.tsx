import { exportAllData, importAllData, resetOnboarding } from '@/utils/storage'
import { Button, Stack, Text, toast } from '@/components/shared'
import { Download, Upload, RotateCcw } from 'lucide-react'
import React, { type FC } from 'react'
import { t } from '@/utils/i18n'
import { SettingItem } from './SettingItem'

export const DataSettings: FC = () => {
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    try {
      await exportAllData()
      toast.success(t('exportSettingsSuccess'))
    } catch (error) {
      console.error('Failed to export settings:', error)
      toast.error(t('exportSettingsError'))
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const result = await importAllData(file)
      toast.success(t('importSettingsSuccess'))
      for (const warning of result.warnings) {
        toast.warning(warning)
      }
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      console.error('Failed to import settings:', error)
      const errorMessage = t('importSettingsError').replace('{error}', (error as Error).message)
      toast.error(errorMessage)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRestartOnboarding = async () => {
    await resetOnboarding()
    // Reload to show the onboarding dialog
    window.location.reload()
  }

  return (
    <Stack direction={'column'} className={'gap-2 w-full'} data-testid="data-settings">
      <Text gray level="s">
        {t('configureDataSettings')}
      </Text>
      <SettingItem
        IconClass={Download}
        title={t('exportSettings')}
        description={t('exportSettingsDescription')}
        control={
          <Button variant={'outline'} onClick={handleExport} data-testid="export-settings">
            {t('export')}
          </Button>
        }
      />
      <SettingItem
        IconClass={Upload}
        title={t('importSettings')}
        description={t('importSettingsDescription')}
        control={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              style={{ display: 'none' }}
              data-testid="import-settings-input"
            />
            <Button variant={'outline'} onClick={() => fileInputRef.current?.click()} data-testid="import-settings">
              {t('import')}
            </Button>
          </>
        }
      />
      <SettingItem
        IconClass={RotateCcw}
        title={t('restartOnboarding')}
        description={t('restartOnboardingDescription')}
        control={
          <Button variant={'outline'} onClick={handleRestartOnboarding} data-testid="restart-onboarding">
            {t('restart')}
          </Button>
        }
      />
    </Stack>
  )
}
