import type { ICommandResolver, ICommandResult, ICommandResolverWithSettings, CommandQueryPayload } from '../protocol'
import { Layers } from 'lucide-react'
import { t } from '@extension/i18n'
import { cn } from '@/lib/utils'

/**
 * Internal plugin that shows all available plugins when input is empty
 * This helps users discover what plugins are available and their trigger keys
 */
export const PLUGIN_LIST_NAME = '__internal_plugin_list__'

// Extended params interface for internal use with resolver service
interface ExtendedCommandQueryParams extends CommandQueryPayload {
  resolverService?: {
    registeredResolvers: ICommandResolverWithSettings[]
  }
}

function createKeyIcon(key: string) {
  const InnerComponent: React.FC<{
    className?: string
  }> = ({ className }: { className?: string }) => {
    return <p className={cn('font-medium text-lg text-center', className)}>{key}</p>
  }

  return InnerComponent
}

export const pluginListResolver: ICommandResolver = {
  properties: {
    name: PLUGIN_LIST_NAME,
    displayName: t('availablePlugins'),
    description: t('availablePluginsDescription'),
    icon: Layers,
  },
  resolve: async params => {
    // Only show when query is completely empty
    if (params.query.length !== 0) return null

    // Get all registered plugins from the service
    // This will be populated by passing the resolver service as context
    const extendedParams = params as ExtendedCommandQueryParams
    const { resolverService } = extendedParams

    if (!resolverService) return null

    const results: ICommandResult[] = []

    // Get all active plugins
    const activePlugins = resolverService.registeredResolvers.filter(r => {
      return r.settings.active
    })

    // Create result items for each plugin
    for (const plugin of activePlugins) {
      const triggerKey = plugin.settings.activeKey

      // Skip the plugin-list itself
      if (plugin.properties.name === PLUGIN_LIST_NAME) continue

      // Skip plugins without trigger keys
      if (!triggerKey) continue

      results.push({
        id: `plugin-list-${plugin.properties.name}`,
        title: plugin.properties.displayName,
        description: plugin.properties.description || '',
        IconType: createKeyIcon(triggerKey),
        onSelect: () => {
          // Add a space after trigger key for better UX
          params.changeQuery?.(triggerKey + ' ')
        },
      })
    }

    return results
  },
}
