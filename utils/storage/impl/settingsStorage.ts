import deepmerge from 'deepmerge'
import { storage } from 'wxt/utils/storage'
import { updateStorageItem } from '../core'

export const DEFAULT_WALLPAPER_URL = 'https://w.wallhaven.cc/full/ml/wallhaven-mlpll9.jpg'
export const DEFAULT_MQTT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt'

export type MqttSetting = {
  mqttBrokerUrl: string
  secretKey: string
  enabled: boolean
  username: string
}

export type WallpaperType = 'url' | 'local'
export type WallhavenSortMode = 'toplist' | 'random'

export type SettingProps = {
  useHistorySuggestion: boolean
  autoFocusCommandInput: boolean
  doubleClickBackgroundFocusCommand: boolean
  showBookmarksInQuickUrlMenu: boolean
  showOpenTabsInQuickUrlMenu: boolean
  bookmarkFolderId: string | null
  wallpaperUrl: string | null
  wallpaperType: WallpaperType
  wallhavenSortMode: WallhavenSortMode
  mqttSettings: MqttSetting
}

export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

export const defaultSetting: SettingProps = {
  useHistorySuggestion: false,
  autoFocusCommandInput: false,
  doubleClickBackgroundFocusCommand: false,
  showBookmarksInQuickUrlMenu: true,
  showOpenTabsInQuickUrlMenu: true,
  bookmarkFolderId: null,
  wallpaperUrl: null,
  wallpaperType: 'url',
  wallhavenSortMode: 'toplist',
  mqttSettings: {
    enabled: false,
    mqttBrokerUrl: DEFAULT_MQTT_BROKER_URL,
    secretKey: '',
    username: '',
  },
}

export const settingStorage = storage.defineItem<SettingProps>('local:settings-storage', {
  fallback: defaultSetting,
})

export async function updateSettings(data: DeepPartial<SettingProps>): Promise<void> {
  await updateStorageItem(settingStorage, current => deepmerge(current, data) as SettingProps)
}

export async function getMqttSettings(): Promise<MqttSetting> {
  return (await settingStorage.getValue()).mqttSettings
}
