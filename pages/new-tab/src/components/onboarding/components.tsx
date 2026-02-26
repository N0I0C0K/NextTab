import type { FC, ReactNode } from 'react'
import { Button, Stack, Text } from '@extension/ui'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@extension/i18n'
import type { OnboardingStep } from './types'
import { STEPS } from './types'

/**
 * Step header with icon and title/description
 */
interface StepHeaderProps {
  icon: ReactNode
  title: string
  description: string
  iconClassName?: string
}

export const StepHeader: FC<StepHeaderProps> = ({ icon, title, description, iconClassName }) => (
  <>
    <div className={cn('rounded-full bg-primary/10 p-4', iconClassName)}>{icon}</div>
    <Stack direction="column" className="items-center gap-2 text-center">
      <Text className="text-2xl font-semibold">{title}</Text>
      <Text gray className="max-w-sm">
        {description}
      </Text>
    </Stack>
  </>
)

/**
 * Step container wrapper
 */
interface StepContainerProps {
  children: ReactNode
  className?: string
}

export const StepContainer: FC<StepContainerProps> = ({ children, className }) => (
  <Stack direction="column" className={cn('items-center gap-6 py-4', className)}>
    {children}
  </Stack>
)

/**
 * Navigation buttons for steps
 */
interface StepNavigationButtonsProps {
  onBack?: () => void
  onNext: () => void
  onSkip?: () => void
  nextLabel?: string
  backLabel?: string
  skipLabel?: string
  nextDisabled?: boolean
}

export const StepNavigationButtons: FC<StepNavigationButtonsProps> = ({
  onBack,
  onNext,
  onSkip,
  nextLabel,
  backLabel,
  skipLabel,
  nextDisabled,
}) => (
  <Stack className="gap-2 w-full">
    {onBack && (
      <Button variant="outline" onClick={onBack} className="flex-1">
        {backLabel ?? t('onboardingBack')}
      </Button>
    )}
    {onSkip && (
      <Button variant="outline" onClick={onSkip} className="flex-1">
        {skipLabel ?? t('onboardingSkip')}
      </Button>
    )}
    <Button onClick={onNext} className="flex-1" disabled={nextDisabled}>
      {nextLabel ?? t('onboardingNext')}
    </Button>
  </Stack>
)

/**
 * Step progress indicator
 */
interface StepIndicatorProps {
  currentStep: OnboardingStep
}

export const StepIndicator: FC<StepIndicatorProps> = ({ currentStep }) => {
  const currentIndex = STEPS.indexOf(currentStep)
  return (
    <Stack className="gap-1.5 justify-center mt-4">
      {STEPS.map((step, index) => (
        <div
          key={step}
          className={cn(
            'w-2 h-2 rounded-full transition-colors',
            index <= currentIndex ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
        />
      ))}
    </Stack>
  )
}

/**
 * Selectable option card (for theme selection, etc.)
 */
interface SelectableCardProps {
  selected: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}

export const SelectableCard: FC<SelectableCardProps> = ({ selected, onClick, children, className }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors',
      selected ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/50',
      className,
    )}>
    {children}
  </button>
)

/**
 * Checkbox indicator
 */
interface CheckboxIndicatorProps {
  checked: boolean
  className?: string
}

export const CheckboxIndicator: FC<CheckboxIndicatorProps> = ({ checked, className }) => (
  <div
    className={cn(
      'size-5 rounded border-2 flex items-center justify-center transition-colors shrink-0',
      checked ? 'bg-primary border-primary' : 'border-muted-foreground/50',
      className,
    )}>
    {checked && <Check className="size-3 text-primary-foreground" />}
  </div>
)
