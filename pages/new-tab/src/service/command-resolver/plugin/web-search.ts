import type { ICommandResolver } from '../protocol'
import type { UiSchema } from '@rjsf/utils'
import { Search } from 'lucide-react'
import { t } from '@extension/i18n'
import { z } from 'zod'

const webSearchCustomSettingsSchema = z.object({
  searchEngines: z
    .array(
      z
        .object({
          title: z
            .string()
            .trim()
            .optional()
            .meta({
              title: t('commandPluginWebSearchSearchEngineTitle'),
              description: t('commandPluginWebSearchSearchEngineTitleDescription'),
            }),
          url: z
            .url()
            .refine(value => value.includes('%s'), {
              message: t('commandPluginWebSearchSearchEngineTemplatePlaceholderError'),
            })
            .meta({
              title: t('commandPluginWebSearchSearchEngineTemplate'),
              description: t('commandPluginWebSearchSearchEngineTemplateDescription'),
            }),
        })
        .meta({
          title: t('commandPluginWebSearchSearchEngineItemTitle'),
        }),
    )
    .default([])
    .meta({
      title: t('commandPluginWebSearchSearchEngines'),
      description: t('commandPluginWebSearchSearchEnginesDescription'),
    }),
})

type WebSearchCustomSettings = z.infer<typeof webSearchCustomSettingsSchema>

const webSearchCustomSettingsUiSchema: UiSchema<WebSearchCustomSettings> = {
  searchEngines: {
    'ui:options': {
      orderable: false,
    },
    items: {
      'ui:options': {
        label: false,
      },
      title: {
        'ui:placeholder': t('commandPluginWebSearchSearchEngineTitlePlaceholder'),
      },
      url: {
        'ui:placeholder': t('commandPluginWebSearchSearchEngineTemplatePlaceholder'),
      },
    },
  },
}

function buildSearchUrl(template: string, query: string): string {
  return template.replaceAll('%s', encodeURIComponent(query))
}

function getSearchEngineDisplayName(searchEngine: WebSearchCustomSettings['searchEngines'][number]): string {
  if (searchEngine.title && searchEngine.title.length > 0) {
    return searchEngine.title
  }

  try {
    return new URL(searchEngine.url).hostname
  } catch {
    return t('commandPluginWebSearchCustomEngineFallback')
  }
}

function createSearchResultTitle(query: string, engineName: string): string {
  return t('commandPluginWebSearchTitleWithEngine').replace('{query}', query).replace('{engine}', engineName)
}

export const webSearchResolver: ICommandResolver<typeof webSearchCustomSettingsSchema> = {
  customSettingsSchema: webSearchCustomSettingsSchema,
  customSettingsUiSchema: webSearchCustomSettingsUiSchema,
  properties: {
    name: 'webSearch',
    displayName: t('commandPluginWebSearch'),
    description: t('commandPluginWebSearchDescription'),
    icon: Search,
  },
  async resolve(params) {
    if (params.query.length === 0) return null

    const results = [
      {
        id: 'search-default-engine',
        title: createSearchResultTitle(params.query, t('commandPluginWebSearchDefaultEngine')),
        description: t('commandPluginWebSearchDefaultEngineDescription'),
        IconType: Search,
        onSelect: () => {
          chrome.search.query({ text: params.query, disposition: 'NEW_TAB' })
        },
      },
    ]

    if (!params.settings.customSettings) return results

    const { searchEngines } = params.settings.customSettings
    if (searchEngines.length > 0) {
      return [
        ...results,
        ...searchEngines.map((searchEngine, index) => {
          const engineName = getSearchEngineDisplayName(searchEngine)
          return {
            id: `search-engine-${index}`,
            title: createSearchResultTitle(params.query, engineName),
            description: buildSearchUrl(searchEngine.url, params.query),
            IconType: Search,
            onSelect: () => {
              chrome.tabs.create({
                url: buildSearchUrl(searchEngine.url, params.query),
                active: true,
              })
            },
          }
        }),
      ]
    }

    return results
  },
}
