import { EventEmitter } from 'events'
import type { MqttClient } from 'mqtt'
import { describe, expect, it, vi } from 'vitest'
import { MqttSecretPrefixTopicRegisterService } from './helper'

function createClient() {
  return Object.assign(new EventEmitter(), {
    connected: true,
    subscribeAsync: vi.fn(async (topics: string[]) => topics.map(topic => ({ topic }))),
    unsubscribeAsync: vi.fn(async () => undefined),
  })
}

describe('MQTT subscription ownership', () => {
  it('ignores a late subscription acknowledgement from the previous client', async () => {
    const service = new MqttSecretPrefixTopicRegisterService()
    service.registerTopic('drink-water')
    await service.setSecretPrefix('old-channel')
    const first = createClient()
    let acknowledge!: (topics: { topic: string }[]) => void
    first.subscribeAsync.mockImplementationOnce(() => new Promise(resolve => (acknowledge = resolve)))
    const loadingFirst = service.setMqttClient(first as unknown as MqttClient)
    await vi.waitFor(() => expect(first.subscribeAsync).toHaveBeenCalled())

    first.connected = false
    await service.setSecretPrefix('new-channel')
    const next = createClient()
    await service.setMqttClient(next as unknown as MqttClient)
    acknowledge([{ topic: 'old-channel/drink-water' }])
    await loadingFirst
    await service.syncSubscription()

    expect(next.unsubscribeAsync).toHaveBeenCalledExactlyOnceWith(['new-channel/drink-water'])
    expect(service.isTopicRegistered('drink-water')).toBe(true)
  })

  it('still removes the previous channel when changing a prefix on the same connected client', async () => {
    const service = new MqttSecretPrefixTopicRegisterService()
    service.registerTopic('drink-water')
    await service.setSecretPrefix('old-channel')
    const client = createClient()
    await service.setMqttClient(client as unknown as MqttClient)

    await service.setSecretPrefix('new-channel')

    expect(client.unsubscribeAsync).toHaveBeenCalledExactlyOnceWith(['old-channel/drink-water'])
    expect(client.subscribeAsync).toHaveBeenLastCalledWith(['new-channel/drink-water'])
    expect(service.isTopicRegistered('drink-water')).toBe(true)
  })
})
