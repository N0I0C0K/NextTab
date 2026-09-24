import { storage } from 'wxt/utils/storage'

export type MqttState = { connected: boolean }

export const mqttStateStorage = storage.defineItem<MqttState>('local:mqtt-state-storage', {
  fallback: { connected: false },
})

export const mqttStateManager = mqttStateStorage

export async function setMqttConnected(connected: boolean): Promise<void> {
  await mqttStateStorage.setValue({ connected })
}
