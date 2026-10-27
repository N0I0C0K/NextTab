import type { ICommandResolver, ICommandResultGroup, CommandQueryParams, CommandSettings } from './plugin'

import {
  historyResolver,
  tabSearchResolver,
  webSearchResolver,
  calculatorResolver,
  numberToRmbResolver,
  bookmarksResolver,
  quickLinksResolver,
  pluginListResolver,
} from './plugin'
import { WarpDefaultObject } from '@/utils'
import { commandSettingsStorage, defaultCommandSettings } from '@/utils/storage'
import type { CommandSettingsData } from '@/utils/storage'
import { matchesTriggerKey, stripTriggerKeyForPlugin } from './utils'
import { filter } from 'lodash'
import { t } from '@/utils/i18n'

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
  private ready: Promise<void>
  private watching = false
  private storageRevision = 0
  private readingSettings?: Promise<void>

  constructor() {
    this.ready = this.initStorage().catch(() => undefined)

    this.pluginListResolverInstance = createResolverWithSettings(pluginListResolver, this.getStorageSettings)
  }

  get registeredResolvers() {
    return filter(this.resolvers, it => !it.properties.name.startsWith('__'))
  }

  private async initStorage() {
    if (this.readingSettings) return this.readingSettings
    if (!this.watching) {
      commandSettingsStorage.watch(value => {
        this.storageRevision++
        this._storageSettings = value
        this.sortResolvers()
      })
      this.watching = true
    }
    const revision = this.storageRevision
    const request = commandSettingsStorage.getValue().then(value => {
      if (revision !== this.storageRevision) return
      this._storageSettings = value
      this.sortResolvers()
    })
    this.readingSettings = request
    try {
      await request
    } finally {
      if (this.readingSettings === request) this.readingSettings = undefined
    }
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

  choosePlugins(rawQuery: string, resolverName?: string): { plugins: ICommandResolverWithSettings[]; hit: boolean } {
    const availablePlugins = this.resolvers.filter(it => it.getSettings().active)

    if (resolverName && resolverName !== 'all') {
      return { plugins: availablePlugins.filter(it => it.properties.name === resolverName), hit: true }
    }

    // When query is empty, show plugin list
    if (rawQuery.length === 0) {
      if (this.pluginListResolverInstance) {
        return { plugins: [this.pluginListResolverInstance], hit: true }
      }
    }

    // Try to match plugins with activeKey
    const matchedPlugins = availablePlugins.filter(it => {
      if (resolverName === 'all') return false
      const settings = it.getSettings()
      return matchesTriggerKey(rawQuery, settings.activeKey)
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

  async resolve(params: CommandQueryParams, onGroupResolve: (group: ICommandResultGroup) => void) {
    const _tick = ++this._queryTimes
    await this.ready
    if (!this._storageSettings) {
      try {
        await this.initStorage()
      } catch {
        if (_tick === this._queryTimes)
          onGroupResolve({
            groupName: t('commandPluginSettings'),
            result: [
              {
                id: 'retry-command-settings',
                title: t('navigationReadFailed'),
                description: t('retryAction'),
                keepOpen: true,
                onSelect: () => params.retry?.(),
              },
            ],
          })
        return
      }
    }
    if (_tick !== this._queryTimes) return
    // Choose plugins based on raw query
    const { plugins, hit } = this.choosePlugins(params.rawQuery, params.resolverName)

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
      openQuickLinks: params.openQuickLinks,
      openSearchResults: params.openSearchResults,
      addQuickLink: params.addQuickLink,
      openSearchEngines: params.openSearchEngines,
      retry: params.retry,
      resolverName: params.resolverName,
      resolverService: this,
    }

    await Promise.all(
      plugins.map(it => {
        return new Promise(resolve => {
          // Get settings once for this plugin
          const settings = it.getSettings()

          // Strip trigger key for this specific plugin
          const strippedQuery = params.resolverName
            ? params.query
            : stripTriggerKeyForPlugin(params.rawQuery, settings.activeKey)

          // Create params with plugin-specific stripped query
          const pluginParams: CommandQueryParams & { resolverService: CommandResolverService } = {
            ...baseParams,
            query: strippedQuery,
          }

          it.resolve(pluginParams)
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
            .catch(() => {
              warpOnGroupResolve({
                groupName: it.properties.displayName,
                result: [
                  {
                    id: `retry-${it.properties.name}`,
                    title: t('navigationReadFailed'),
                    description: t('retryAction'),
                    keepOpen: true,
                    onSelect: () => params.retry?.(),
                  },
                ],
              })
              resolve(null)
            })
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
commandResolverService.register(quickLinksResolver)
