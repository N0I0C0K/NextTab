import { EventEmitter } from 'events'
import type { MqttClient } from 'mqtt'
import mqtt from 'mqtt'
import { describe, expect, it, vi } from 'vitest'
import { MqttProvider } from './provider'

vi.mock('mqtt', () => ({ default: { connect: vi.fn() } }))

function createClient() {
  const client = Object.assign(new EventEmitter(), {
    connected: false,
    reconnect: vi.fn(),
    subscribeAsync: vi.fn(async () => []),
    endAsync: vi.fn(async () => {
      client.connected = false
      client.emit('end')
    }),
  })
  vi.mocked(mqtt.connect).mockReturnValue(client as unknown as MqttClient)
  return client
}

describe('MQTT connection cancellation', () => {
  it('cancels a pending handshake without loading or subscribing the client', async () => {
    const client = createClient()
    const provider = new MqttProvider({ brokerUrl: 'wss://example.com/mqtt' })
    const loaded = vi.fn()
    provider.on('client-loaded', loaded)
    await provider.changeSecretPrefix('secret')
    const connecting = provider.connect()
    await provider.disconnect()
    await connecting
    client.connected = true
    client.emit('connect')
    expect(client.endAsync).toHaveBeenCalledWith(true)
    expect(provider.initialized).toBe(false)
    expect(loaded).not.toHaveBeenCalled()
    expect(client.subscribeAsync).not.toHaveBeenCalled()
  })

  it('ends a disconnected client so automatic retries stop and a later connect uses a fresh client', async () => {
    const first = createClient()
    const provider = new MqttProvider({ brokerUrl: 'wss://example.com/mqtt' })
    await provider.changeSecretPrefix('secret')
    const connecting = provider.connect()
    first.connected = true
    first.emit('connect')
    await connecting
    first.connected = false
    await provider.disconnect()
    expect(first.endAsync).toHaveBeenCalledWith(true)
    const next = createClient()
    const reconnecting = provider.connect()
    next.connected = true
    next.emit('connect')
    await reconnecting
    expect(provider.client).toBe(next)
    expect(first.reconnect).not.toHaveBeenCalled()
    await provider.disconnect()
  })
})
