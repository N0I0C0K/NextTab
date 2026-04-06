import type {
  ICommandResolver,
  ICommandResultGroup,
  CommandQueryPayload,
  CommandSettings,
  ICommandResolverWithSettings,
  CommandResolveParams,
} from './plugin'

import {
  historyResolver,
  tabSearchResolver,
  webSearchResolver,
  calculatorResolver,
  numberToRmbResolver,
  bookmarksResolver,
  pluginListResolver,
} from './plugin'
import { WarpDefaultObject } from '@extension/shared'
import { commandSettingsStorage, defaultCommandSettings } from '@extension/storage'
import type { CommandSettingsMapping, CommandPluginStorageSettings } from '@extension/storage'
import { stripTriggerKeyForPlugin } from './utils'
import { filter } from 'lodash'
import type { ZodType } from 'zod'

export type IDisposable = {
  dispose: () => void
}

const fallbackSettings: CommandPluginStorageSettings = {
  priority: 0,
  active: true,
  includeInGlobal: true,
  activeKey: '',
}

function createResolverWithSettings<T extends ZodType<Record<string, unknown>>>(
  resolver: ICommandResolver<T>,
  settingProxy: () => CommandPluginStorageSettings,
): ICommandResolverWithSettings<T> {
  let cachedRawSettings: CommandPluginStorageSettings | null = null
  let cachedSettings: CommandSettings<T['_output']> | null = null

  return {
    ...resolver,
    get settings(): CommandSettings<T['_output']> {
      const rawSettings = settingProxy()
      if (cachedRawSettings === rawSettings && cachedSettings) {
        return cachedSettings
      }
      cachedRawSettings = rawSettings
      const customSettings = resolver.customSettingsSchema
        ? resolver.customSettingsSchema.safeParse(rawSettings.customSettings)
        : undefined
      cachedSettings = { ...rawSettings, customSettings: customSettings?.data }
      return cachedSettings
    },
  }
}

class CommandResolverService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private resolvers: ICommandResolverWithSettings<any>[] = []
  private _queryTimes = 0
  private _storageSettings: CommandSettingsMapping | null = null
  private pluginListResolverInstance: ICommandResolverWithSettings

  constructor() {
    // Try to get initial settings synchronously from snapshot
    this._storageSettings = commandSettingsStorage.getSnapshot()
    // Initialize async to ensure storage is properly loaded and subscribed to changes
    this.initStorage()

    this.pluginListResolverInstance = createResolverWithSettings(
      pluginListResolver,
      this.generateResolverSettingProxy(pluginListResolver),
    )
  }

  get registeredResolvers() {
    return filter(this.resolvers, it => !it.properties.name.startsWith('__'))
  }

  private async initStorage() {
    // Get initial settings if not already loaded from snapshot
    if (!this._storageSettings) {
      this._storageSettings = await commandSettingsStorage.get()
    }

    // Subscribe to storage changes
    commandSettingsStorage.subscribe(() => {
      const snapshot = commandSettingsStorage.getSnapshot()
      if (snapshot) {
        this._storageSettings = snapshot
      }
    })
  }

  private getStorageSettings(): CommandSettingsMapping | null {
    return this._storageSettings
  }

  private generateResolverSettingProxy<T extends ZodType<Record<string, unknown>>>(
    resolver: ICommandResolver<T>,
  ): () => CommandPluginStorageSettings {
    return () => {
      const storageSettings = this.getStorageSettings()
      const pluginStorageSettings = storageSettings?.[resolver.properties.name]
      const defaultPluginSettings = defaultCommandSettings[resolver.properties.name]
      if (pluginStorageSettings && defaultPluginSettings) {
        return WarpDefaultObject(pluginStorageSettings, defaultPluginSettings)
      }
      return defaultPluginSettings ?? fallbackSettings
    }
  }

  register<T extends ZodType<Record<string, unknown>>>(resolver: ICommandResolver<T>) {
    this.resolvers.push(createResolverWithSettings(resolver, this.generateResolverSettingProxy(resolver)))
    this.sortResolvers()
  }

  sortResolvers() {
    this.resolvers.sort((a, b) => {
      return a.settings.priority - b.settings.priority
    })
  }

  choosePlugins(rawQuery: string): { plugins: ICommandResolverWithSettings[]; hit: boolean } {
    const availablePlugins = this.resolvers.filter(it => it.settings.active)

    // When query is empty, show plugin list
    if (rawQuery.length === 0) {
      if (this.pluginListResolverInstance) {
        return { plugins: [this.pluginListResolverInstance], hit: true }
      }
    }

    // Try to match plugins with activeKey
    const matchedPlugins = availablePlugins.filter(it => {
      const settings = it.settings
      return settings.activeKey && rawQuery.startsWith(settings.activeKey)
    })

    if (matchedPlugins.length > 0) {
      return {
        plugins: matchedPlugins,
        hit: true,
      }
    }

    // Return global plugins
    return {
      plugins: this.resolvers.filter(it => {
        const settings = it.settings
        return settings.active && settings.includeInGlobal
      }),
      hit: false,
    }
  }

  resolve(params: CommandQueryPayload, onGroupResolve: (group: ICommandResultGroup) => void) {
    const _tick = ++this._queryTimes
    // Choose plugins based on raw query
    const { plugins, hit } = this.choosePlugins(params.rawQuery)

    const warpOnGroupResolve = (group: ICommandResultGroup) => {
      if (_tick !== this._queryTimes) {
        return
      }
      // Skip empty groups if no trigger key hit
      if (!hit && group.result.length === 0) {
        return
      }
      onGroupResolve(group)
    }
    // Base params object to reuse
    const baseParams = {
      rawQuery: params.rawQuery,
      changeQuery: params.changeQuery,
      resolverService: this,
    }

    Promise.all(
      plugins.map(it => {
        return new Promise((resolve, reject) => {
          // Get settings once for this plugin
          const settings = it.settings

          // Strip trigger key for this specific plugin
          const strippedQuery = stripTriggerKeyForPlugin(params.rawQuery, settings.activeKey)

          // Create params with plugin-specific stripped query
          const pluginParams: CommandResolveParams<Record<string, unknown>> = {
            ...baseParams,
            query: strippedQuery,
            settings,
          }

          it.resolve
            .call(it, pluginParams)
            .then(res => {
              if (res === null || res.length === 0) {
                // If plugin returns null or empty array, still show empty group for non-empty queries
                // This helps users know the plugin was invoked but found nothing
                if (strippedQuery.length > 0) {
                  warpOnGroupResolve({
                    groupName: it.properties.displayName,
                    result: [],
                  })
                }
                resolve(null)
                return
              }
              warpOnGroupResolve({
                groupName: it.properties.displayName,
                result: res,
              })
              resolve(null)
            })
            .catch(err => reject(err))
        })
      }),
    )
  }
}

export const commandResolverService = new CommandResolverService()

commandResolverService.register(historyResolver)
commandResolverService.register(tabSearchResolver)
commandResolverService.register(webSearchResolver)
commandResolverService.register(calculatorResolver)
commandResolverService.register(numberToRmbResolver)
commandResolverService.register(bookmarksResolver)
