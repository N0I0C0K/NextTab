import { StorageEnum } from '../base/enums'
import { createStorage } from '../base/base'
import type { BaseStorage } from '../base/types'
import deepmerge from 'deepmerge'

export const DEFAULT_WALLPAPER_URL = 'https://w.wallhaven.cc/full/ml/wallhaven-mlpll9.jpg'
export const DEFAULT_MQTT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt'

export type MqttSetting = {
  mqttBrokerUrl: string
  secretKey: string
  enabled: boolean
  username: string
}

/**
 * Represents the source type for wallpaper display.
 * - 'url': Uses a remote URL (wallpaperUrl) to fetch the wallpaper image
 * - 'local': Uses a locally uploaded image stored as base64 data (localWallpaperData)
 */
export type WallpaperType = 'url' | 'local'

/**
 * Represents the sorting mode for Wallhaven gallery.
 * - 'toplist': Shows top-rated wallpapers from the past month
 * - 'random': Shows random wallpapers
 */
export type WallhavenSortMode = 'toplist' | 'random'

export type SettingProps = {
  useHistorySuggestion: boolean
  autoFocusCommandInput: boolean
  doubleClickBackgroundFocusCommand: boolean
  showBookmarksInQuickUrlMenu: boolean
  showOpenTabsInQuickUrlMenu: boolean
  /** The specific bookmark folder ID to filter bookmarks in context menu. null means show all bookmarks */
  bookmarkFolderId: string | null
  wallpaperUrl: string | null
  /** The source type for the wallpaper (remote URL or local file) */
  wallpaperType: WallpaperType
  /** 
   * Base64-encoded local wallpaper image data.
   * Note: Base64 encoding increases size by ~33%. A 5MB image becomes ~6.7MB.
   * Be aware of Chrome's storage.local quota limits (~10MB total).
   */
  localWallpaperData: string | null
  /** The sorting mode for Wallhaven gallery (toplist or random) */
  wallhavenSortMode: WallhavenSortMode
  mqttSettings: MqttSetting
}

type DeepPartial<T> = T extends object
  ? {
    [K in keyof T]?: DeepPartial<T[K]>;
  }
  : T;

type SettingsStorage = BaseStorage<SettingProps> & {
  update: (data: DeepPartial<SettingProps>) => Promise<void>
  getMqttSettings: () => Promise<MqttSetting | null>
}

const defaultSetting: SettingProps = {
  useHistorySuggestion: true,
  autoFocusCommandInput: true,
  doubleClickBackgroundFocusCommand: true,
  showBookmarksInQuickUrlMenu: true,
  showOpenTabsInQuickUrlMenu: true,
  bookmarkFolderId: null,
  wallpaperUrl: null,
  wallpaperType: 'url',
  localWallpaperData: null,
  wallhavenSortMode: 'toplist',
  mqttSettings: {
    enabled: false,
    mqttBrokerUrl: DEFAULT_MQTT_BROKER_URL,
    secretKey: 'ABCDEF',
    username: 'MomoBoss',
  },
}

const storage = createStorage<SettingProps>('settings-storage', defaultSetting, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
})

export const settingStorage: SettingsStorage = {
  ...storage,
  update: async data => {
    storage.set(preVal => (deepmerge(preVal, data) as SettingProps))
  },
  getMqttSettings: async () => {
    const settings = await storage.get()
    return settings.mqttSettings
  },
}
