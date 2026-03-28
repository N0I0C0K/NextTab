import { StorageEnum } from '../base/enums'
import { createStorage } from '../base/base'
import type { BaseStorage } from '../base/types'
import deepmerge from 'deepmerge'

/**
 * Settings for a single command plugin
 */
export interface CommandPluginSettings {
  priority: number // The lower the number, the higher the priority
  active: boolean
  activeKey: string
  includeInGlobal: boolean
  customSettings?: Record<string, unknown>
}

/**
 * All command plugin settings keyed by plugin name
 */
export type CommandSettingsData = {
  [pluginName: string]: CommandPluginSettings
}

type DeepPartial<T> = T extends object
  ? {
      [K in keyof T]?: DeepPartial<T[K]>
    }
  : T

type CommandSettingsStorage = BaseStorage<CommandSettingsData> & {
  update: (data: DeepPartial<CommandSettingsData>) => Promise<void>
  getPluginSettings: (pluginName: string) => Promise<CommandPluginSettings | undefined>
  setPluginSettings: (pluginName: string, settings: Partial<CommandPluginSettings>) => Promise<void>
}

/**
 * Default settings for built-in command plugins
 */
export const defaultCommandSettings: CommandSettingsData = {
  history: {
    priority: 0,
    active: true,
    activeKey: 'h',
    includeInGlobal: true,
  },
  tabs: {
    priority: 0,
    active: true,
    activeKey: '',
    includeInGlobal: true,
  },
  webSearch: {
    priority: 100,
    active: true,
    activeKey: 'g',
    includeInGlobal: true,
    customSettings: {},
  },
  calculator: {
    priority: -10,
    active: true,
    activeKey: '=',
    includeInGlobal: true,
  },
  numberToRmb: {
    priority: 50,
    active: true,
    activeKey: 'rmb',
    includeInGlobal: true,
  },
  bookmarks: {
    priority: 5,
    active: true,
    activeKey: 'b',
    includeInGlobal: true,
  },
}

const storage = createStorage<CommandSettingsData>('command-settings-storage', defaultCommandSettings, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
})

export const commandSettingsStorage: CommandSettingsStorage = {
  ...storage,
  update: async data => {
    await storage.set(preVal => deepmerge(preVal, data) as CommandSettingsData)
  },
  getPluginSettings: async pluginName => {
    const settings = await storage.get()
    return settings[pluginName]
  },
  setPluginSettings: async (pluginName, settings) => {
    const currentSettings = await storage.get()
    const currentPluginSettings = currentSettings[pluginName] ||
      defaultCommandSettings[pluginName] || {
        priority: 0,
        active: true,
        activeKey: '',
        includeInGlobal: true,
        customSettings: {},
      }
    await storage.set({
      ...currentSettings,
      [pluginName]: {
        ...currentPluginSettings,
        ...settings,
      },
    })
  },
}
