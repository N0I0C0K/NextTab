import { exportAllData, importAllData } from '@extension/storage'
import { Button, Stack, Text, toast } from '@extension/ui'
import { Download, Upload } from 'lucide-react'
import React, { type FC } from 'react'
import { t } from '@extension/i18n'
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

  return (
    <Stack direction={'column'} className={'gap-2 w-full'}>
      <Text gray level="s">
        {t('configureDataSettings')}
      </Text>
      <SettingItem
        IconClass={Download}
        title={t('exportSettings')}
        description={t('exportSettingsDescription')}
        control={
          <Button variant={'outline'} onClick={handleExport}>
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
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
            <Button variant={'outline'} onClick={() => fileInputRef.current?.click()}>
              {t('import')}
            </Button>
          </>
        }
      />
    </Stack>
  )
}
