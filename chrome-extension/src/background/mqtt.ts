import type { ILoadable } from './type'

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
    await mqttStateManager.setConnected(false)
  })
  client.on('connect', async () => {
    console.log('MQTT connected')
    await mqttStateManager.setConnected(true)
  })
}

const mqttProvider: MqttProvider = new MqttProvider({})
const payloadBuilder = new MqttPayloadBuilder()
mqttProvider.on('client-loaded', async client => {
  if (client.connected) {
    await mqttStateManager.setConnected(true)
  }
  initMqttClientEvent(client)
})

// Track previous settings to detect actual changes
let previousSettings: { secretKey: string; username: string; brokerUrl: string } | null = null

async function setupMqtt() {
  await mqttStateManager.setConnected(false)
  const settings = await settingStorage.get()
  const { mqttSettings } = settings
  console.log('Current MQTT settings:', settings.mqttSettings)

  if (!(mqttSettings?.enabled && mqttSettings.secretKey)) {
    console.log('MQTT is disabled or not properly configured.')
    return
  }

  // Check if MQTT broker permission is granted
  const hasMqttPermission = await hasPermission(MQTT_PERMISSION_ORIGINS)
  if (!hasMqttPermission) {
    console.log('MQTT broker permission not granted, skipping connection.')
    return
  }

  console.log('Connecting to MQTT broker...')
  await mqttProvider.changeSecretPrefix(mqttSettings.secretKey)
  payloadBuilder.username = mqttSettings.username
  await mqttProvider.connect({ brokerUrl: mqttSettings.mqttBrokerUrl || DEFAULT_MQTT_BROKER_URL })
  console.log('MQTT connected')
  
  // Initialize previous settings to track changes
  previousSettings = {
    secretKey: settings.mqttSettings.secretKey,
    username: settings.mqttSettings.username,
    brokerUrl: settings.mqttSettings.mqttBrokerUrl,
  }
}

closeMqttClientMessage.registerListener(async () => {
  await mqttProvider.disconnect()
})

openMqttClientMessage.registerListener(async () => {
  // Check if MQTT broker permission is granted before connecting
  const hasMqttPermission = await hasPermission(MQTT_PERMISSION_ORIGINS)
  if (!hasMqttPermission) {
    console.log('MQTT broker permission not granted, cannot connect.')
    return
  }

  const settings = await settingStorage.get()
  const { mqttSettings } = settings

  if (!(mqttSettings?.enabled && mqttSettings.secretKey)) {
    console.log('MQTT is disabled or not properly configured.')
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
    await mqttStateManager.setConnected(false)
  })()
})

const heartBeatEvent = mqttProvider.getOrCreateTopicEvent<MqttBasePayload>('heart-beat')

// Drink water event handler - defined before usage
const drinkWaterEvent = mqttProvider.getOrCreateTopicEvent<MqttBasePayload>('drink-water')
drinkWaterEvent.subscribe(async payload => {
  console.log('Received drink water reminder from:', payload.senderUserName)

  // Validate sender username to prevent malicious content
  const senderUserName =
    typeof payload.senderUserName === 'string' && payload.senderUserName.trim()
      ? payload.senderUserName.trim().substring(0, 50) // Limit length for safety
      : 'Someone'

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
  console.log('Received request to send drink water reminder')

  await drinkWaterEvent.emit(payloadBuilder.buildPayload({}))
  console.log('Drink water reminder sent successfully')
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

// Listen for settings changes and update MQTT configuration
async function handleSettingsChange() {
  const settings = await settingStorage.get()
  
  // Check if MQTT is enabled and properly configured
  if (!(settings.mqttSettings?.enabled && settings.mqttSettings.secretKey)) {
    console.log('MQTT is disabled or not properly configured. Disconnecting...')
    if (mqttProvider.connected) {
      await mqttProvider.disconnect()
    }
    previousSettings = null
    return
  }

  const currentSettings = {
    secretKey: settings.mqttSettings.secretKey,
    username: settings.mqttSettings.username,
    brokerUrl: settings.mqttSettings.mqttBrokerUrl,
  }

  // Check if this is the first time or if settings have actually changed
  const secretKeyChanged = previousSettings?.secretKey !== currentSettings.secretKey
  const brokerUrlChanged = previousSettings?.brokerUrl !== currentSettings.brokerUrl
  const usernameChanged = previousSettings?.username !== currentSettings.username

  // Skip if nothing changed
  if (previousSettings && !secretKeyChanged && !brokerUrlChanged && !usernameChanged) {
    return
  }

  if (!previousSettings || secretKeyChanged || brokerUrlChanged || usernameChanged) {
    console.log('Settings changed. Updating MQTT configuration...')

    // Update secret key if it changed (this will resubscribe to topics with new prefix)
    if (mqttProvider.initialized && secretKeyChanged) {
      console.log('Secret key changed, updating prefix...')
      await mqttProvider.changeSecretPrefix(currentSettings.secretKey)
    }

    // Update username if it changed
    if (usernameChanged) {
      console.log('Username changed, updating payload builder...')
      payloadBuilder.username = currentSettings.username
    }

    // Reconnect if broker URL changed or if not connected
    if (brokerUrlChanged || !mqttProvider.connected) {
      console.log('Reconnecting to MQTT broker with new settings...')
      if (mqttProvider.connected && brokerUrlChanged) {
        await mqttProvider.disconnect()
        await mqttStateManager.setConnected(false)
      }
      await mqttProvider.connect({ brokerUrl: currentSettings.brokerUrl })
      await mqttStateManager.setConnected(true)
    }

    // Update previous settings
    previousSettings = currentSettings
  }
}

export const MqttLoader: ILoadable = {
  async load() {
    await setupMqtt()
    
    // Subscribe to settings changes
    settingStorage.subscribe(() => {
      handleSettingsChange().catch(error => {
        console.error('Error handling MQTT settings change:', error)
      })
    })
  },
}
