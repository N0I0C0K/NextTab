import mqtt from 'mqtt'
import { EventEmitter } from 'events'
import { MqttSecretPrefixTopicRegisterService } from './helper'

export interface MqttConnectionOptions {
  brokerUrl?: string
  useReconnect?: boolean
}

class TopicEventHandler<T> {
  private rawTopic: string
  private readonly provider: MqttProvider
  private callbacks: Array<(payload: T) => void> = []

  constructor(rawTopic: string, provider: MqttProvider) {
    this.rawTopic = rawTopic
    this.provider = provider
  }

  public get topic(): string {
    return this.rawTopic
  }

  public subscribe(callback: (payload: T) => void) {
    const alreadyRegistered = this.callbacks.find(cb => cb === callback)
    if (alreadyRegistered) return
    this.callbacks.push(callback)
  }

  public unsubscribe(callback: (payload: T) => void): number {
    this.callbacks = this.callbacks.filter(cb => cb !== callback)
    return this.callbacks.length
  }

  public isEmpty(): boolean {
    return this.callbacks.length === 0
  }

  public onReceive(topic: string, payload: T) {
    this.callbacks.forEach(callback => callback(payload))
  }

  async emit(payload: T): Promise<void> {
    await this.provider.publish<T>(this.rawTopic, payload)
  }
}

type MqttProviderEventMap = {
  'client-loaded': [mqtt.MqttClient]
}

/**
 * MQTT Provider class for managing MQTT connections and message handling.
 * Provides topic subscription, publishing, and event handling capabilities.
 */
export class MqttProvider extends EventEmitter<MqttProviderEventMap> {
  private _clientInner: mqtt.MqttClient | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private registeredTopics: Map<string, TopicEventHandler<any>> = new Map()
  private brokerUrl?: string
  private _secretPrefix?: string
  private topicRegisterService: MqttSecretPrefixTopicRegisterService

  constructor({ brokerUrl }: { brokerUrl?: string }) {
    super()
    this.brokerUrl = brokerUrl
    this.topicRegisterService = new MqttSecretPrefixTopicRegisterService()

    this.on('client-loaded', async client => {
      await this.topicRegisterService.setSecretPrefix(this.secretPrefix)
      await this.topicRegisterService.setMqttClient(client)
    })
  }

  get connected(): boolean {
    return this._clientInner?.connected || false
  }

  get initialized(): boolean {
    return this._clientInner !== null
  }

  get secretPrefix(): string {
    if (!this._secretPrefix) {
      throw new Error('Secret prefix is not set')
    }
    return this._secretPrefix
  }

  get client(): mqtt.MqttClient {
    if (!this._clientInner) {
      throw new Error('MQTT client is not initialized')
    }
    return this._clientInner
  }

  /**
   * Changes the secret prefix and resubscribes to all topics with the new prefix.
   * @param newPrefix - The new secret prefix to use
   */
  async changeSecretPrefix(newPrefix: string) {
    await this.topicRegisterService.setSecretPrefix(newPrefix)
    this._secretPrefix = newPrefix
  }

  async connect(options?: MqttConnectionOptions) {
    console.log('Attempting to connect to MQTT broker with options:', options)
    const { brokerUrl, useReconnect = true } = options || {}
    if (brokerUrl) {
      this.brokerUrl = brokerUrl
    }

    if (this._clientInner) {
      if (this._clientInner.connected) {
        return
      }
      if (useReconnect) {
        this._clientInner.reconnect()
        return
      }
    }

    if (!this.brokerUrl) {
      throw new Error('MQTT broker URL is not set')
    }

    try {
      this._clientInner = await mqtt.connectAsync(this.brokerUrl)
    } catch (error) {
      this._clientInner = null
      console.error('Failed to connect to MQTT broker:', error)
      throw error
    }
    this.emit('client-loaded', this._clientInner)
    this._clientInner.on('message', (topic: string, message: Buffer) => {
      const rawTopic = this.topicRegisterService.removeSecretPrefix(topic)
      const topicEvent = this.registeredTopics.get(rawTopic)
      if (!topicEvent) return
      try {
        const payload = JSON.parse(message.toString())
        topicEvent.onReceive(rawTopic, payload)
        console.log('Received message on topic', rawTopic, 'with payload', payload)
      } catch (error) {
        console.error('Error emitting topic event:', error)
      }
    })
  }

  async disconnect() {
    if (!this._clientInner || !this._clientInner.connected) return
    await this._clientInner.endAsync()
  }

  deleteTopicEvent<T>(event: TopicEventHandler<T>) {
    if (!this.registeredTopics.has(event.topic)) {
      return
    }
    this.topicRegisterService.unregisterTopic(event.topic)
    this.registeredTopics.delete(event.topic)
  }

  getOrCreateTopicEvent<T>(topic: string): TopicEventHandler<T> {
    if (!this.registeredTopics.has(topic)) {
      this.topicRegisterService.registerTopic(topic)
      this.registeredTopics.set(topic, new TopicEventHandler<T>(topic, this))
    }
    return this.registeredTopics.get(topic)!
  }

  async publish<T>(topic: string, payload: T): Promise<void> {
    if (!this.connected) {
      console.error('Cannot publish message: MQTT client is not connected')
      return
    }
    const secretTopic = this.topicRegisterService.joinSecretPrefix(topic)
    await this.client.publishAsync(secretTopic, JSON.stringify(payload))
    console.log(`Published to topic: ${secretTopic}`, payload)
  }
}
