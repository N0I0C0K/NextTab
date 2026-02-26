import { useState, type FC } from 'react'
import { Button, Stack, Text } from '@extension/ui'
import { importAllData } from '@extension/storage'
import { t } from '@extension/i18n'
import { Upload, Sparkles } from 'lucide-react'
import { StepHeader, StepContainer } from '../components'

interface WelcomeStepProps {
  onNext: () => void
  onImported: () => void
  onSkipAll: () => void
}

export const WelcomeStep: FC<WelcomeStepProps> = ({ onNext, onImported, onSkipAll }) => {
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportError(null)

    try {
      const result = await importAllData(file)
      if (result.warnings.length > 0) {
        console.warn('Import warnings:', result.warnings)
      }
      onImported()
    } catch (error) {
      setImportError((error as Error).message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <StepContainer>
      <StepHeader
        icon={<Sparkles className="size-8 text-primary" />}
        title={t('onboardingWelcomeTitle')}
        description={t('onboardingWelcomeDescription')}
      />

      <Stack direction="column" className="gap-3 w-full">
        <div className="w-full">
          <input
            type="file"
            id="import-settings-file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
            disabled={importing}
          />
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => document.getElementById('import-settings-file')?.click()}
            disabled={importing}>
            <Upload className="size-4" />
            {importing ? t('loading') : t('onboardingImportSettings')}
          </Button>
        </div>
        {importError && (
          <Text level="xs" className="text-destructive text-center">
            {importError}
          </Text>
        )}
        <Button onClick={onNext} className="w-full">
          {t('onboardingStartSetup')}
        </Button>
        <Button variant="ghost" onClick={onSkipAll} className="w-full">
          {t('onboardingSkipAll')}
        </Button>
      </Stack>
    </StepContainer>
  )
}
