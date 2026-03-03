import { useState, useEffect, type FC } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@extension/ui'
import { useStorage } from '@extension/shared'
import { onboardingStorage } from '@extension/storage'
import { t } from '@extension/i18n'
import type { OnboardingStep } from './types'
import { StepIndicator } from './components'
import { WelcomeStep, ThemeStep, WallpaperStep, QuickLinksStep, CompleteStep } from './steps'

export const OnboardingDialog: FC = () => {
  const isCompleted = useStorage(onboardingStorage)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<OnboardingStep>('welcome')

  useEffect(() => {
    if (!isCompleted) {
      setOpen(true)
    }
  }, [isCompleted])

  const handleComplete = async () => {
    await onboardingStorage.markCompleted()
    setOpen(false)
  }

  const goToStep = (newStep: OnboardingStep) => {
    setStep(newStep)
  }

  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return <WelcomeStep onNext={() => goToStep('theme')} onImported={handleComplete} onSkipAll={handleComplete} />
      case 'theme':
        return <ThemeStep onNext={() => goToStep('wallpaper')} onBack={() => goToStep('welcome')} />
      case 'wallpaper':
        return <WallpaperStep onNext={() => goToStep('quicklinks')} onBack={() => goToStep('theme')} />
      case 'quicklinks':
        return <QuickLinksStep onNext={() => goToStep('complete')} onBack={() => goToStep('wallpaper')} />
      case 'complete':
        return <CompleteStep onComplete={handleComplete} />
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="w-[50vw] max-w-[40rem] flex flex-col"
        hideCloseButton
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}>
        <DialogHeader className="sr-only">
          <DialogTitle>{t('onboardingTitle')}</DialogTitle>
          <DialogDescription>{t('onboardingDescription')}</DialogDescription>
        </DialogHeader>

        {renderStep()}
        <StepIndicator currentStep={step} />
      </DialogContent>
    </Dialog>
  )
}

export default OnboardingDialog
