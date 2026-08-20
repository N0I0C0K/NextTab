export interface Message<T> {
  name: string
  payload: T
}

export class MessageHandler<T> {
  private listeners: Array<(payload: T) => void | Promise<void>> = []
  public readonly name: string
  constructor(messageName: string) {
    this.name = messageName
  }
  public async emit(payload: T): Promise<void> {
    await sendMessage<T>({ name: this.name, payload })
  }
  public registerListener(callback: (payload: T) => void | Promise<void>): void {
    if (!this.listeners.includes(callback)) {
      this.listeners.push(callback)
    }
  }
  public unregisterListener(callback: (payload: T) => void | Promise<void>): void {
    const index = this.listeners.indexOf(callback)
    if (index !== -1) {
      this.listeners.splice(index, 1)
    }
  }
  public async onMessage(message: Message<T>): Promise<void> {
    if (message.name !== this.name) return
    await Promise.all(this.listeners.map(callback => callback(message.payload)))
  }
}

export class MessageCenter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private registeredHandlers: Map<string, MessageHandler<any>> = new Map()
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chrome.runtime.onMessage.addListener((message: Message<any>, _sender, sendResponse) => {
      if (!this.registeredHandlers.has(message.name)) return false
      const handler = this.registeredHandlers.get(message.name)!
      void handler
        .onMessage(message)
        .then(() => sendResponse())
        .catch(error => {
          console.error(`Failed to handle runtime message: ${message.name}`, error)
          sendResponse()
        })
      return true
    })
  }
  registerMessageHandler<T>(messageName: string): MessageHandler<T> {
    if (this.registeredHandlers.has(messageName)) {
      return this.registeredHandlers.get(messageName)! as MessageHandler<T>
    }
    const newHandler = new MessageHandler<T>(messageName)
    this.registeredHandlers.set(messageName, newHandler)
    return newHandler
  }
  unregisterMessageHandler(messageName: string): void {
    if (!this.registeredHandlers.has(messageName)) return
    this.registeredHandlers.delete(messageName)
  }
}

export const sendMessage = async <T>(message: Message<T>) => {
  await chrome.runtime.sendMessage(message)
}

export let messageCenter: MessageCenter

export let closeMqttClientMessage: MessageHandler<void>
export let openMqttClientMessage: MessageHandler<void>
export let sendDrinkWaterReminderMessage: MessageHandler<void>

if (globalThis.chrome) {
  messageCenter = new MessageCenter()
  closeMqttClientMessage = messageCenter.registerMessageHandler<void>('close-mqtt-client')
  openMqttClientMessage = messageCenter.registerMessageHandler<void>('open-mqtt-client')
  sendDrinkWaterReminderMessage = messageCenter.registerMessageHandler<void>('send-drink-water-reminder')
}
