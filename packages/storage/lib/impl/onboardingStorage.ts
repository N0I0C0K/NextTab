import { StorageEnum } from '../base/enums'
import { createStorage } from '../base/base'
import type { BaseStorage } from '../base/types'

type OnboardingStorage = BaseStorage<boolean> & {
  markCompleted: () => Promise<void>
  reset: () => Promise<void>
}

const storage = createStorage<boolean>('onboarding-completed-key', false, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
})

export const onboardingStorage: OnboardingStorage = {
  ...storage,
  markCompleted: async () => {
    await storage.set(true)
  },
  reset: async () => {
    await storage.set(false)
  },
}
