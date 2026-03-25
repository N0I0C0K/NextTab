import type { ICommandResolver } from '../protocol'
import { Search } from 'lucide-react'
import { t } from '@extension/i18n'
import type { UiSchema } from '@rjsf/utils'
import { z } from '@extension/ui/lib/components/ui/form'

const searchEngineTemplatePlaceholder = 'https://www.google.com/search?q=%s'

const webSearchCustomSettingsSchema = z.object({
  searchEngines: z
    .array(
      z.string()
        .url()
        .refine(value => value.includes('%s'), {
          message: t('commandPluginWebSearchSearchEngineTemplatePlaceholderError'),
        })
        .meta({
          title: t('commandPluginWebSearchSearchEngineTemplate'),
          description: t('commandPluginWebSearchSearchEngineTemplateDescription'),
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
      'ui:placeholder': searchEngineTemplatePlaceholder,
    },
  },
}

function getWebSearchCustomSettings(customSettings: Record<string, unknown> | undefined): WebSearchCustomSettings {
  const parsedSettings = webSearchCustomSettingsSchema.safeParse(customSettings ?? {})
  if (!parsedSettings.success) {
    return webSearchCustomSettingsSchema.parse({})
  }
  return parsedSettings.data
}

function buildSearchUrl(template: string, query: string): string {
  return template.replaceAll('%s', encodeURIComponent(query))
}

function getSearchEngineDescription(template: string): string {
  try {
    return new URL(buildSearchUrl(template, 'nexttab')).hostname
  } catch {
    return template
  }
}

export const webSearchResolver: ICommandResolver = {
  settings: {
    priority: 100,
    active: true,
    includeInGlobal: true,
    activeKey: 'g',
    customSettings: webSearchCustomSettingsSchema.parse({}),
  },
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

    const { searchEngines } = getWebSearchCustomSettings(this.settings.customSettings)
    if (searchEngines.length > 0) {
      return searchEngines.map((searchEngine, index) => ({
        id: `search-engine-${index}`,
        title: t('commandPluginWebSearchTitle').replace('{query}', params.query),
        description: getSearchEngineDescription(searchEngine),
        IconType: Search,
        onSelect: () => {
          chrome.tabs.create({
            url: buildSearchUrl(searchEngine, params.query),
            active: true,
          })
        },
      }))
    }

    return [
      {
        id: `search-unique-key`,
        title: t('commandPluginWebSearchTitle').replace('{query}', params.query),
        description: t('commandPluginWebSearchDescription'),
        IconType: Search,
        onSelect: () => {
          chrome.search.query({ text: params.query, disposition: 'NEW_TAB' })
        },
      },
    ]
  },
}
