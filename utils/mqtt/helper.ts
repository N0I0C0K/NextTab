import type { MqttBasePayload } from './payload'
import type { MqttClient } from 'mqtt'
import { nanoid } from 'nanoid'

export class MqttPayloadBuilder {
  private _username?: string
  constructor(username?: string) {
    this._username = username
  }
  set username(name: string) {
    this._username = name
  }
  get username(): string {
    if (!this._username) {
      throw new Error('Username is not set for MqttPayloadBuilder')
    }
    return this._username
  }
  buildPayload<T>(data: T): T & MqttBasePayload {
    return {
      ...data,
      id: nanoid(),
      senderUserName: this.username,
      timestamp: Date.now(),
    }
  }
}

export class MqttSecretPrefixTopicRegisterService {
  private registeredSecretTopics: Set<string> = new Set() // topics registered with secret prefix
  private rawTopics: Set<string> = new Set() // raw topics without secret prefix
  private _secretPrefix: string | null = null
  private _client: MqttClient | null = null

  get isSecretPrefixSet(): boolean {
    return this._secretPrefix !== null
  }

  private get connected(): boolean {
    return this._client !== null && this._client.connected
  }

  get secretPrefix(): string {
    if (!this.isSecretPrefixSet) {
      throw new Error('Secret prefix is not set')
    }
    return this._secretPrefix!
  }

  isTopicRegistered(topic: string): boolean {
    const secretTopic = this.joinSecretPrefix(topic)
    return this.registeredSecretTopics.has(secretTopic)
  }

  /**
   * Joins the secret prefix with the raw topic.
   * @param rawTopic
   * @throws Error if secret prefix is not set
   * @returns The topic with secret prefix
   */
  joinSecretPrefix(rawTopic: string): string {
    return `${this.secretPrefix}/${rawTopic}`
  }

  removeSecretPrefix(secretTopic: string): string {
    const prefixWithSlash = this.secretPrefix + '/'
    if (secretTopic.startsWith(prefixWithSlash)) {
      return secretTopic.slice(prefixWithSlash.length)
    }
    return secretTopic
  }

  async setSecretPrefix(newPrefix: string) {
    if (this._secretPrefix === newPrefix) return
    this._secretPrefix = newPrefix
  }

  async setMqttClient(client: MqttClient) {
    if (this._client === client) return
    this._client = client

    if (client.connected) {
      await this.syncSubscription()
    }
    client.on('connect', async () => {
      console.log('MqttSecretPrefixTopicRegisterService detected MQTT client connected')
      await this.syncSubscription()
    })
  }

  registerTopic(topic: string) {
    this.rawTopics.add(topic)
    if (!this.isSecretPrefixSet) {
      return
    }
    const secretTopic = this.joinSecretPrefix(topic)
    this.subscribeTopic(secretTopic)
  }

  unregisterTopic(topic: string) {
    this.rawTopics.delete(topic)
    if (!this.isSecretPrefixSet) {
      return
    }
    const secretTopic = this.joinSecretPrefix(topic)
    this.unSubscribeTopic(secretTopic)
  }

  private subscribeTopic(secretTopic: string) {
    if (!this.connected) {
      return
    }
    this._client!.subscribe(secretTopic)
    this.registeredSecretTopics.add(secretTopic)
    console.log('Subscribed to topic:', secretTopic)
  }

  private unSubscribeTopic(secretTopic: string) {
    if (!this.connected) {
      return
    }
    this._client!.unsubscribe(secretTopic)
    this.registeredSecretTopics.delete(secretTopic)
    console.log('Unsubscribed from topic:', secretTopic)
  }

  // Subscribe to all raw topics with the current secret prefix
  async syncSubscription() {
    console.log('Syncing subscriptions with secret prefix...', this.secretPrefix, this.connected)
    if (!this.connected || !this.isSecretPrefixSet) {
      return
    }
    await this.unSubscribeAll()
    await this.subscribeAll()
  }

  private async subscribeAll() {
    if (!this.connected || !this.isSecretPrefixSet) {
      return
    }
    const topics = Array.from(this.rawTopics).map(topic => this.joinSecretPrefix(topic))
    if (topics.length === 0) return
    const res = await this._client!.subscribeAsync(topics)
    res.forEach(it => this.registeredSecretTopics.add(it.topic))
    console.log('Subscribed to all topics with secret prefix:', res)
  }

  // Unsubscribe from all registered secret topics
  private async unSubscribeAll() {
    if (!this.connected) {
      return
    }
    const topics = Array.from(this.registeredSecretTopics)
    if (topics.length === 0) return
    await this._client!.unsubscribeAsync(topics)
    this.registeredSecretTopics.clear()
    console.log('Unsubscribed from all topics with secret prefix:', topics)
  }
}
