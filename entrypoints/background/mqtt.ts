import { DEFAULT_MQTT_BROKER_URL, setMqttConnected, settingStorage } from '@/utils/storage'
import {
  MqttPayloadBuilder,
  MqttProvider,
  closeMqttClientMessage,
  openMqttClientMessage,
  sendDrinkWaterReminderMessage,
  hasPermission,
  PERMISSION_ORIGINS,
  normalizeMqttSenderUserName,
} from '@/utils'
import type { MqttBasePayload } from '@/utils'
import type { MqttClient } from 'mqtt'

const MQTT_PERMISSION_ORIGINS = [PERMISSION_ORIGINS.MQTT_BROKER]

const hasRelevantPermissionChange = (permissions: chrome.permissions.Permissions) => {
  return (
    permissions.origins?.some(changedOrigin => MQTT_PERMISSION_ORIGINS.some(origin => origin === changedOrigin)) ??
    false
  )
}

async function initMqttClientEvent(client: MqttClient) {
  client.on('close', async () => {
    console.log('MQTT connection closed')
    await setMqttConnected(false)
  })
  client.on('connect', async () => {
    console.log('MQTT connected')
    await setMqttConnected(true)
  })
}

export function startMqttService() {
  const mqttProvider: MqttProvider = new MqttProvider({})
  const payloadBuilder = new MqttPayloadBuilder()
  mqttProvider.on('client-loaded', async client => {
    if (client.connected) {
      await setMqttConnected(true)
    }
    initMqttClientEvent(client)
  })

  async function setupMqtt() {
    await setMqttConnected(false)
    const settings = await settingStorage.getValue()
    const { mqttSettings } = settings

    if (!(mqttSettings?.enabled && mqttSettings.secretKey)) {
      return
    }

    // Check if MQTT broker permission is granted
    const hasMqttPermission = await hasPermission(MQTT_PERMISSION_ORIGINS)
    if (!hasMqttPermission) {
      return
    }

    await mqttProvider.changeSecretPrefix(mqttSettings.secretKey)
    payloadBuilder.username = mqttSettings.username
    await mqttProvider.connect({ brokerUrl: mqttSettings.mqttBrokerUrl || DEFAULT_MQTT_BROKER_URL })
  }

  closeMqttClientMessage.registerListener(async () => {
    await mqttProvider.disconnect()
  })

  openMqttClientMessage.registerListener(async () => {
    // Check if MQTT broker permission is granted before connecting
    const hasMqttPermission = await hasPermission(MQTT_PERMISSION_ORIGINS)
    if (!hasMqttPermission) {
      return
    }

    const settings = await settingStorage.getValue()
    const { mqttSettings } = settings

    if (!(mqttSettings?.enabled && mqttSettings.secretKey)) {
      return
    }

    payloadBuilder.username = mqttSettings.username
    await mqttProvider.changeSecretPrefix(mqttSettings.secretKey)
    await mqttProvider.connect({ brokerUrl: mqttSettings.mqttBrokerUrl || DEFAULT_MQTT_BROKER_URL })
  })

  chrome.permissions.onAdded.addListener(permissions => {
    if (!hasRelevantPermissionChange(permissions)) {
      return
    }

    void setupMqtt()
  })

  chrome.permissions.onRemoved.addListener(permissions => {
    if (!hasRelevantPermissionChange(permissions)) {
      return
    }

    void (async () => {
      await mqttProvider.disconnect()
      await setMqttConnected(false)
    })()
  })

  const heartBeatEvent = mqttProvider.getOrCreateTopicEvent<MqttBasePayload>('heart-beat')

  // Drink water event handler - defined before usage
  const drinkWaterEvent = mqttProvider.getOrCreateTopicEvent<MqttBasePayload>('drink-water')
  drinkWaterEvent.subscribe(async payload => {
    // Validate sender username to prevent malicious content
    const senderUserName = normalizeMqttSenderUserName(payload.senderUserName)

    // Create Chrome notification with safe ID generation
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
    if (alarm.name === 'mqtt-heart-beat') {
      if (!mqttProvider.connected) {
        return
      }
      await heartBeatEvent.emit(payloadBuilder.buildPayload({}))
    }
  })

  void setupMqtt()
}
