import type { MqttClient } from 'mqtt'
import { describe, expect, it, vi } from 'vitest'
import { MqttPayloadBuilder, MqttSecretPrefixTopicRegisterService } from './helper'
import { normalizeMqttSenderUserName } from './notification'

function createClient() {
  const subscribeAsync = vi.fn(async (topics: string[]) => topics.map(topic => ({ topic, qos: 0 as const })))
  const unsubscribeAsync = vi.fn(async () => undefined)
  const client = {
    connected: true,
    on: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    subscribeAsync,
    unsubscribeAsync,
  } as unknown as MqttClient

  return { client, subscribeAsync, unsubscribeAsync }
}

describe('MQTT payload builder', () => {
  it('adds trusted metadata and does not allow input to override it', () => {
    const builder = new MqttPayloadBuilder('alice')
    const before = Date.now()
    const payload = builder.buildPayload({ id: 'forged', senderUserName: 'mallory', value: 42 })

    expect(payload).toMatchObject({ senderUserName: 'alice', value: 42 })
    expect(payload.id).not.toBe('forged')
    expect(payload.id).toBeTruthy()
    expect(payload.timestamp).toBeGreaterThanOrEqual(before)
  })

  it('requires a username before building a payload', () => {
    expect(() => new MqttPayloadBuilder().buildPayload({})).toThrow('Username is not set')
  })
})

describe('MQTT topic registration', () => {
  it('subscribes registered raw topics after the client and secret become available', async () => {
    const service = new MqttSecretPrefixTopicRegisterService()
    const { client, subscribeAsync } = createClient()
    service.registerTopic('heart-beat')

    await service.setSecretPrefix('secret')
    await service.setMqttClient(client)

    expect(subscribeAsync).toHaveBeenCalledWith(['secret/heart-beat'])
    expect(service.isTopicRegistered('heart-beat')).toBe(true)
    expect(service.removeSecretPrefix('secret/heart-beat')).toBe('heart-beat')
  })

  it('moves active subscriptions when the secret changes', async () => {
    const service = new MqttSecretPrefixTopicRegisterService()
    const { client, subscribeAsync, unsubscribeAsync } = createClient()
    service.registerTopic('drink-water')
    await service.setSecretPrefix('old-secret')
    await service.setMqttClient(client)

    await service.setSecretPrefix('new-secret')

    expect(unsubscribeAsync).toHaveBeenCalledWith(['old-secret/drink-water'])
    expect(subscribeAsync).toHaveBeenLastCalledWith(['new-secret/drink-water'])
    expect(service.isTopicRegistered('drink-water')).toBe(true)
  })

  it('rejects topic prefix operations before a secret is configured', () => {
    const service = new MqttSecretPrefixTopicRegisterService()
    expect(() => service.joinSecretPrefix('heart-beat')).toThrow('Secret prefix is not set')
  })
})

describe('MQTT notification sender names', () => {
  it('trims valid names and limits their length', () => {
    expect(normalizeMqttSenderUserName('  alice  ')).toBe('alice')
    expect(normalizeMqttSenderUserName('a'.repeat(60))).toBe('a'.repeat(50))
  })

  it('uses a safe fallback for blank or non-string names', () => {
    expect(normalizeMqttSenderUserName('   ')).toBe('Someone')
    expect(normalizeMqttSenderUserName(undefined)).toBe('Someone')
    expect(normalizeMqttSenderUserName({ name: 'mallory' })).toBe('Someone')
  })
})
