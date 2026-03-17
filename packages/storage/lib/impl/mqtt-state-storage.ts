import { StorageEnum } from '../base/enums'
import { createStorage } from '../base/base'
import type { BaseStorage } from '../base/types'

export type MqttState = {
  connected: boolean
}

export type MqttStateManager = BaseStorage<MqttState> & {
  setConnected: (connected: boolean) => Promise<void>
}

export const mqttStateStorage = createStorage<MqttState>(
  'mqtt-state-storage',
  {
    connected: false,
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
)

export const mqttStateManager: MqttStateManager = {
  ...mqttStateStorage,
  setConnected: async (connected: boolean) => {
    await mqttStateStorage.set(prev => ({
      ...prev,
      connected,
    }))
  },
}
