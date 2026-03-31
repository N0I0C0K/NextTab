import { StorageEnum } from '../base/enums'
import { createStorage } from '../base/base'
import type { BaseStorage } from '../base/types'
import deepmerge from 'deepmerge'

/**
 * Settings for a single command plugin
 */
export interface CommandPluginStorageSettings {
  priority: number // The lower the number, the higher the priority
  active: boolean
  activeKey: string
  includeInGlobal: boolean
  customSettings?: Record<string, unknown>
}

/**
 * Default settings for built-in command plugins
 */
const defaultCommandSettingsDefinition = {
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
  __internal_plugin_list__: {
    priority: 1000,
    active: true,
    activeKey: '',
    includeInGlobal: false,
  },
} as const satisfies Record<string, CommandPluginStorageSettings>

export const defaultCommandSettings: CommandSettingsMapping = defaultCommandSettingsDefinition

export type CommandPluginName = keyof typeof defaultCommandSettingsDefinition

/**
 * All command plugin settings keyed by plugin name
 */
export type CommandSettingsMapping = {
  [pluginName in CommandPluginName]?: CommandPluginStorageSettings
}

type DeepPartial<T> = T extends object
  ? {
      [K in keyof T]?: DeepPartial<T[K]>
    }
  : T

type CommandSettingsStorage = BaseStorage<CommandSettingsMapping> & {
  update: (data: DeepPartial<CommandSettingsMapping>) => Promise<void>
  getPluginSettings: (pluginName: CommandPluginName) => Promise<CommandPluginStorageSettings | undefined>
  setPluginSettings: (pluginName: CommandPluginName, settings: Partial<CommandPluginStorageSettings>) => Promise<void>
}

const storage = createStorage<CommandSettingsMapping>('command-settings-storage', defaultCommandSettings, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
})

export const commandSettingsStorage: CommandSettingsStorage = {
  ...storage,
  update: async data => {
    await storage.set(preVal => deepmerge(preVal, data) as CommandSettingsMapping)
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
