import { storage } from 'wxt/utils/storage'

export const onboardingStorage = storage.defineItem<boolean>('local:onboarding-completed-key', {
  fallback: false,
})

export const markOnboardingCompleted = () => onboardingStorage.setValue(true)
export const resetOnboarding = () => onboardingStorage.setValue(false)
