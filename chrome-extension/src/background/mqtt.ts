import { DEFAULT_MQTT_BROKER_URL, mqttStateManager, settingStorage } from '@extension/storage'
import {
  MqttPayloadBuilder,
  MqttProvider,
  closeMqttClientMessage,
  openMqttClientMessage,
  sendDrinkWaterReminderMessage,
  hasPermission,
  PERMISSION_ORIGINS,
} from '@extension/shared'
import type { MqttBasePayload } from '@extension/shared'
import type { MqttClient } from 'mqtt'

const MQTT_PERMISSION_ORIGINS: string[] = [PERMISSION_ORIGINS.MQTT_BROKER]

const hasRelevantPermissionChange = (permissions: chrome.permissions.Permissions) =>
  permissions.origins?.some(changedOrigin => MQTT_PERMISSION_ORIGINS.includes(changedOrigin)) ?? false

async function initMqttClientEvent(client: MqttClient) {
  client.on('close', async () => {
    console.log('MQTT connection closed')
    await mqttStateManager.setConnected(false)
  })
  client.on('connect', async () => {
    console.log('MQTT connected')
    await mqttStateManager.setConnected(true)
  })
}

export function startMqttService() {
  const mqttProvider = new MqttProvider({})
  const payloadBuilder = new MqttPayloadBuilder()

  mqttProvider.on('client-loaded', async client => {
    if (client.connected) {
      await mqttStateManager.setConnected(true)
    }
    await initMqttClientEvent(client)
  })

  async function setupMqtt() {
    await mqttStateManager.setConnected(false)
    const { mqttSettings } = await settingStorage.get()
    console.log('Current MQTT settings:', mqttSettings)

    if (!(mqttSettings?.enabled && mqttSettings.secretKey)) {
      console.log('MQTT is disabled or not properly configured.')
      return
    }

    if (!(await hasPermission(MQTT_PERMISSION_ORIGINS))) {
      console.log('MQTT broker permission not granted, skipping connection.')
      return
    }

    console.log('Connecting to MQTT broker...')
    await mqttProvider.changeSecretPrefix(mqttSettings.secretKey)
    payloadBuilder.username = mqttSettings.username
    await mqttProvider.connect({ brokerUrl: mqttSettings.mqttBrokerUrl || DEFAULT_MQTT_BROKER_URL })
  }

  closeMqttClientMessage.registerListener(async () => {
    await mqttProvider.disconnect()
  })

  openMqttClientMessage.registerListener(async () => {
    if (!(await hasPermission(MQTT_PERMISSION_ORIGINS))) {
      console.log('MQTT broker permission not granted, cannot connect.')
      return
    }

    const { mqttSettings } = await settingStorage.get()
    if (!(mqttSettings?.enabled && mqttSettings.secretKey)) {
      console.log('MQTT is disabled or not properly configured.')
      return
    }

    payloadBuilder.username = mqttSettings.username
    await mqttProvider.changeSecretPrefix(mqttSettings.secretKey)
    await mqttProvider.connect({ brokerUrl: mqttSettings.mqttBrokerUrl || DEFAULT_MQTT_BROKER_URL })
  })

  chrome.permissions.onAdded.addListener(permissions => {
    if (hasRelevantPermissionChange(permissions)) void setupMqtt()
  })

  chrome.permissions.onRemoved.addListener(permissions => {
    if (!hasRelevantPermissionChange(permissions)) return
    void (async () => {
      await mqttProvider.disconnect()
      await mqttStateManager.setConnected(false)
    })()
  })

  const heartBeatEvent = mqttProvider.getOrCreateTopicEvent<MqttBasePayload>('heart-beat')
  const drinkWaterEvent = mqttProvider.getOrCreateTopicEvent<MqttBasePayload>('drink-water')

  drinkWaterEvent.subscribe(async payload => {
    const senderUserName =
      typeof payload.senderUserName === 'string' && payload.senderUserName.trim()
        ? payload.senderUserName.trim().substring(0, 50)
        : 'Someone'
    const notificationId = `drink-water-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon-128.png'),
      title: chrome.i18n.getMessage('drinkWaterNotificationTitle'),
      message: chrome.i18n.getMessage('drinkWaterNotificationMessage', [senderUserName]),
      priority: 2,
      requireInteraction: false,
    })
  })

  sendDrinkWaterReminderMessage.registerListener(async () => {
    await drinkWaterEvent.emit(payloadBuilder.buildPayload({}))
  })

  chrome.alarms.create('mqtt-heart-beat', { periodInMinutes: 0.5 })
  chrome.alarms.onAlarm.addListener(async alarm => {
    if (alarm.name === 'mqtt-heart-beat' && mqttProvider.connected) {
      await heartBeatEvent.emit(payloadBuilder.buildPayload({}))
    }
  })

  void setupMqtt()
}
