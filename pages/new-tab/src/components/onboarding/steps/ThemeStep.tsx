import type { FC } from 'react'
import { Text } from '@extension/ui'
import { useStorage } from '@extension/shared'
import { exampleThemeStorage } from '@extension/storage'
import { t } from '@extension/i18n'
import { Sun, Moon, Monitor } from 'lucide-react'
import type { StepNavigationProps } from '../types'
import { StepHeader, StepContainer, StepNavigationButtons, SelectableCard } from '../components'

const THEME_OPTIONS = [
  { id: 'light', icon: Sun, labelKey: 'onboardingThemeLight' },
  { id: 'dark', icon: Moon, labelKey: 'onboardingThemeDark' },
  { id: 'system', icon: Monitor, labelKey: 'onboardingThemeSystem' },
] as const

export const ThemeStep: FC<StepNavigationProps> = ({ onNext, onBack }) => {
  const theme = useStorage(exampleThemeStorage)

  return (
    <StepContainer>
      <StepHeader
        icon={<Sun className="size-8 text-primary" />}
        title={t('onboardingThemeTitle')}
        description={t('onboardingThemeDescription')}
      />

      <div className="flex gap-3 w-full justify-center">
        {THEME_OPTIONS.map(({ id, icon: Icon, labelKey }) => (
          <SelectableCard
            key={id}
            selected={theme === id}
            onClick={() => exampleThemeStorage.set(id)}
            className="min-w-[100px]">
            <Icon className="size-6" />
            <Text level="s">{t(labelKey)}</Text>
          </SelectableCard>
        ))}
      </div>

      <StepNavigationButtons onBack={onBack} onNext={onNext} />
    </StepContainer>
  )
}
