import { storage } from 'wxt/utils/storage'
import deepmerge from 'deepmerge'
import { updateStorageItem } from '../core'
import type { DeepPartial } from './settingsStorage'

export interface CommandPluginSettings {
  priority: number
  active: boolean
  activeKey: string
  includeInGlobal: boolean
}

export type CommandSettingsData = Record<string, CommandPluginSettings>

export const defaultCommandSettings: CommandSettingsData = {
  history: { priority: 0, active: true, activeKey: 'h', includeInGlobal: true },
  tabs: { priority: 0, active: true, activeKey: '', includeInGlobal: true },
  webSearch: { priority: 100, active: true, activeKey: 'g', includeInGlobal: true },
  calculator: { priority: -10, active: true, activeKey: '=', includeInGlobal: true },
  numberToRmb: { priority: 50, active: true, activeKey: 'rmb', includeInGlobal: true },
  bookmarks: { priority: 5, active: true, activeKey: 'b', includeInGlobal: true },
}

export const commandSettingsStorage = storage.defineItem<CommandSettingsData>('local:command-settings-storage', {
  fallback: defaultCommandSettings,
})

export async function updateCommandSettings(data: DeepPartial<CommandSettingsData>): Promise<void> {
  await updateStorageItem(commandSettingsStorage, current => deepmerge(current, data) as CommandSettingsData)
}

export async function getCommandPluginSettings(pluginName: string): Promise<CommandPluginSettings | undefined> {
  return (await commandSettingsStorage.getValue())[pluginName]
}

export async function setCommandPluginSettings(
  pluginName: string,
  settings: Partial<CommandPluginSettings>,
): Promise<void> {
  await updateStorageItem(commandSettingsStorage, current => ({
    ...current,
    [pluginName]: {
      ...(current[pluginName] ??
        defaultCommandSettings[pluginName] ?? {
          priority: 0,
          active: true,
          activeKey: '',
          includeInGlobal: true,
        }),
      ...settings,
    },
  }))
}
