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
  isRelevantPermissionChange,
} from '@/utils'
import type { MqttBasePayload } from '@/utils'
import type { MqttClient } from 'mqtt'

const MQTT_PERMISSION_ORIGINS = [PERMISSION_ORIGINS.MQTT_BROKER]

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
  let connectionRevision = 0
  const payloadBuilder = new MqttPayloadBuilder()
  mqttProvider.on('client-loaded', async client => {
    if (client.connected) {
      await setMqttConnected(true)
    }
    initMqttClientEvent(client)
  })

  async function setupMqtt() {
    const revision = ++connectionRevision
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
    if (revision !== connectionRevision) return
    payloadBuilder.username = mqttSettings.username
    await mqttProvider.connect({ brokerUrl: mqttSettings.mqttBrokerUrl || DEFAULT_MQTT_BROKER_URL })
  }

  closeMqttClientMessage.registerListener(async () => {
    connectionRevision++
    await mqttProvider.disconnect()
  })

  openMqttClientMessage.registerListener(async () => {
    const revision = ++connectionRevision
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
    if (revision !== connectionRevision) return
    await mqttProvider.connect({ brokerUrl: mqttSettings.mqttBrokerUrl || DEFAULT_MQTT_BROKER_URL })
  })

  chrome.permissions.onAdded.addListener(permissions => {
    if (!isRelevantPermissionChange(permissions, MQTT_PERMISSION_ORIGINS)) {
      return
    }

    void setupMqtt()
  })

  chrome.permissions.onRemoved.addListener(permissions => {
    if (!isRelevantPermissionChange(permissions, MQTT_PERMISSION_ORIGINS)) {
      return
    }

    connectionRevision++
    void (async () => {
      await mqttProvider.disconnect()
      await setMqttConnected(false)
    })()
  })

  settingStorage.watch(settings => {
    if (settings.mqttSettings?.enabled) return
    connectionRevision++
    void mqttProvider.disconnect().then(() => setMqttConnected(false))
  })

  const heartBeatEvent = mqttProvider.getOrCreateTopicEvent<MqttBasePayload>('heart-beat')
  heartBeatEvent.subscribe(payload => {
    console.log('MQTT heart-beat received:', payload)
  })

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
      const payload = payloadBuilder.buildPayload({})
      await heartBeatEvent.emit(payload)
      console.log('MQTT heart-beat sent:', payload)
    }
  })

  void setupMqtt()
}
