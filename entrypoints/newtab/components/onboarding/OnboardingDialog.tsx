import { useState, useEffect, type FC } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/shared'
import { useStorage } from '@/utils'
import { markOnboardingCompleted, onboardingStorage } from '@/utils/storage'
import { t } from '@/utils/i18n'
import type { OnboardingStep } from './types'
import { StepIndicator } from './components'
import { WelcomeStep, ThemeStep, QuickLinksStep, CompleteStep } from './steps'

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
    await markOnboardingCompleted()
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
        return <ThemeStep onNext={() => goToStep('quicklinks')} onBack={() => goToStep('welcome')} />
      case 'quicklinks':
        return <QuickLinksStep onNext={() => goToStep('complete')} onBack={() => goToStep('theme')} />
      case 'complete':
        return <CompleteStep onComplete={handleComplete} />
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (nextOpen) setOpen(true)
      }}>
      <DialogContent
        className="w-[calc(100vw-32px)] max-w-[36rem] max-h-[90vh] overflow-y-auto flex flex-col rounded-xl"
        showCloseButton={false}>
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
