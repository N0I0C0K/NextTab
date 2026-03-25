import type { ICommandResolver, ICommandResultGroup, CommandQueryParams, CommandSettings } from './plugin'

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
import type { CommandSettingsData } from '@extension/storage'
import { stripTriggerKeyForPlugin } from './utils'
import { filter } from 'lodash'

export type IDisposable = {
  dispose: () => void
}

const defaultSettings: CommandSettings = {
  priority: 0,
  active: true,
  includeInGlobal: true,
  activeKey: '',
}

interface ICommandResolverWithSettings extends ICommandResolver {
  getSettings: () => CommandSettings
}

function createResolverWithSettings(
  resolver: ICommandResolver,
  getStorageSettings: () => CommandSettingsData | null,
): ICommandResolverWithSettings {
  return {
    ...resolver,
    getSettings(): CommandSettings {
      const storageSettings = getStorageSettings()
      const pluginStorageSettings = storageSettings?.[resolver.properties.name]
      if (pluginStorageSettings) {
        return pluginStorageSettings
      }
      // Fallback to default command settings or plugin defaults
      const defaultPluginSettings = defaultCommandSettings[resolver.properties.name]
      if (defaultPluginSettings) {
        return defaultPluginSettings
      }
      return WarpDefaultObject(resolver.settings, defaultSettings)
    },
    get settings(): CommandSettings {
      return this.getSettings()
    },
  }
}

class CommandResolverService {
  private resolvers: ICommandResolverWithSettings[] = []
  private _queryTimes = 0
  private _storageSettings: CommandSettingsData | null = null
  private pluginListResolverInstance: ICommandResolverWithSettings

  constructor() {
    // Try to get initial settings synchronously from snapshot
    this._storageSettings = commandSettingsStorage.getSnapshot()
    // Initialize async to ensure storage is properly loaded and subscribed to changes
    this.initStorage()

    this.pluginListResolverInstance = createResolverWithSettings(pluginListResolver, this.getStorageSettings)
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

  private getStorageSettings = (): CommandSettingsData | null => {
    return this._storageSettings
  }

  register(resolver: ICommandResolver) {
    this.resolvers.push(createResolverWithSettings(resolver, this.getStorageSettings))
    this.sortResolvers()
  }

  sortResolvers() {
    this.resolvers.sort((a, b) => {
      return a.getSettings().priority - b.getSettings().priority
    })
  }

  choosePlugins(rawQuery: string): { plugins: ICommandResolverWithSettings[]; hit: boolean } {
    const availablePlugins = this.resolvers.filter(it => it.getSettings().active)

    // When query is empty, show plugin list
    if (rawQuery.length === 0) {
      if (this.pluginListResolverInstance) {
        return { plugins: [this.pluginListResolverInstance], hit: true }
      }
    }

    // Try to match plugins with activeKey
    const matchedPlugins = availablePlugins.filter(it => {
      const settings = it.getSettings()
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
        const settings = it.getSettings()
        return settings.active && settings.includeInGlobal
      }),
      hit: false,
    }
  }

  resolve(params: CommandQueryParams, onGroupResolve: (group: ICommandResultGroup) => void) {
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
          const settings = it.getSettings()

          // Strip trigger key for this specific plugin
          const strippedQuery = stripTriggerKeyForPlugin(params.rawQuery, settings.activeKey)

          // Create params with plugin-specific stripped query
          const pluginParams: CommandQueryParams & { resolverService: CommandResolverService } = {
            ...baseParams,
            query: strippedQuery,
          }

          it.resolve.call(it, pluginParams)
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
