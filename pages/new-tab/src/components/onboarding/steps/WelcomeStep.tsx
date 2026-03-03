import { useState, useRef, type FC } from 'react'
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
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
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
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
            disabled={importing}
            aria-label={t('onboardingImportSettings')}
          />
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}>
            <Upload className="size-4" aria-hidden="true" />
            {importing ? t('loading') : t('onboardingImportSettings')}
          </Button>
        </div>
        {importError && (
          <Text level="xs" className="text-destructive text-center" role="alert">
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
