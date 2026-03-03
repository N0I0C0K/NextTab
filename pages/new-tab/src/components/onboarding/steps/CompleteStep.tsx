import { useState, type FC } from 'react'
import { Button, Stack, Text } from '@extension/ui'
import { t } from '@extension/i18n'
import { Check } from 'lucide-react'
import { StepHeader, StepContainer } from '../components'

interface CompleteStepProps {
  onComplete: () => void
}

export const CompleteStep: FC<CompleteStepProps> = ({ onComplete }) => {
  const [isWindows] = useState(() => navigator.userAgent.toLowerCase().includes('windows'))
  const keyBindings = isWindows ? 'Alt+K' : '⌘+K'

  return (
    <StepContainer>
      <StepHeader
        icon={<Check className="size-8 text-green-500" />}
        iconClassName="bg-green-500/10"
        title={t('onboardingCompleteTitle')}
        description={t('onboardingCompleteDescription')}
      />

      <div className="bg-muted/50 rounded-lg p-4 w-full">
        <Stack direction="column" className="gap-2 items-center">
          <Text level="s" gray>
            {t('onboardingCommandTip')}
          </Text>
          <kbd className="px-3 py-1.5 bg-background rounded-md border text-sm font-mono">{keyBindings}</kbd>
        </Stack>
      </div>

      <Button onClick={onComplete} className="w-full" size="lg">
        {t('onboardingGetStarted')}
      </Button>
    </StepContainer>
  )
}
