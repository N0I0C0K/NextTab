/**
 * Data export/import functionality for user settings and data
 */

import { z, prettifyError } from 'zod'
import { settingStorage } from './settingsStorage'
import { localWallpaperStorage } from './localWallpaperStorage'
import { quickUrlItemsStorage } from './quickUrlStorage'
import { exampleThemeStorage } from './exampleThemeStorage'
import { commandSettingsStorage } from './commandSettingsStorage'

// ---- Zod schemas --------------------------------------------------------

const mqttSettingSchema = z.object({
  mqttBrokerUrl: z.string(),
  secretKey: z.string(),
  enabled: z.boolean(),
  username: z.string(),
})

const settingsSchema = z.object({
  useHistorySuggestion: z.boolean().optional(),
  autoFocusCommandInput: z.boolean().optional(),
  doubleClickBackgroundFocusCommand: z.boolean().optional(),
  showBookmarksInQuickUrlMenu: z.boolean().optional(),
  showOpenTabsInQuickUrlMenu: z.boolean().optional(),
  bookmarkFolderId: z.string().nullable().optional(),
  wallpaperUrl: z.string().nullable().optional(),
  wallpaperType: z.union([z.literal('url'), z.literal('local')]).optional(),
  wallhavenSortMode: z.union([z.literal('toplist'), z.literal('random')]).optional(),
  mqttSettings: mqttSettingSchema.optional(),
})

const quickUrlItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  iconUrl: z.string().optional(),
})

const commandPluginSettingsSchema = z.object({
  priority: z.number(),
  active: z.boolean(),
  activeKey: z.string(),
  includeInGlobal: z.boolean(),
})

const commandSettingsSchema = z.record(z.string(), commandPluginSettingsSchema)

const themeSchema = z.union([z.literal('light'), z.literal('dark'), z.literal('system')])

const exportedDataSchema = z.object({
  version: z.string().optional(),
  exportDate: z.string().optional(),
  theme: themeSchema.optional(),
  settings: settingsSchema.optional(),
  quickUrls: z.array(quickUrlItemSchema).optional(),
  commandSettings: commandSettingsSchema.optional(),
})

// ---- Public types -------------------------------------------------------

/** Shape of a full export file produced by {@link exportAllData}. */
export type ExportedData = z.infer<typeof exportedDataSchema>

export type ImportResult = {
  warnings: string[]
}

// ---- Export -------------------------------------------------------------

/**
 * Export all user data as JSON and download it
 */
export async function exportAllData(): Promise<void> {
  const settings = await settingStorage.get()
  const quickUrls = await quickUrlItemsStorage.get()
  const theme = await exampleThemeStorage.get()
  const commandSettings = await commandSettingsStorage.get()

  const exportData: ExportedData = {
    version: '1.0.0',
    exportDate: new Date().toISOString(),
    theme,
    settings,
    quickUrls,
    commandSettings,
  }

  const jsonString = JSON.stringify(exportData, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `nexttab-settings-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ---- Import -------------------------------------------------------------

/**
 * Import all user data from a JSON file.
 * Supports partial imports — missing fields are skipped and current values are preserved.
 * Each section is validated independently via Zod; invalid sections emit a warning and are skipped.
 */
export async function importAllData(file: File): Promise<ImportResult> {
  const { raw, warnings } = await readImportFile(file)

  // Import settings via deep-merge so missing fields fall back to current stored values
  if (raw.settings !== undefined) {
    const result = settingsSchema.safeParse(raw.settings)
    if (result.success) {
      const settingsToImport = result.data

      // Local wallpaper is not exported.
      if (settingsToImport.wallpaperType === 'local') {
        settingsToImport.wallpaperType = 'url'
      }

      // update() uses deepmerge, so only provided fields overwrite stored values.
      // localWallpaperData is never included in settingsToImport (type guarantees this),
      // so it is always preserved from the current device storage.
      await settingStorage.update(settingsToImport)
    } else {
      warnings.push(`settings: ${prettifyError(result.error)}`)
    }
  }

  // Import quick URLs
  if (raw.quickUrls !== undefined) {
    const result = z.array(quickUrlItemSchema).safeParse(raw.quickUrls)
    if (result.success) {
      await quickUrlItemsStorage.set(result.data)
    } else {
      warnings.push(`quickUrls: ${prettifyError(result.error)}`)
    }
  }

  // Import theme if present
  if (raw.theme !== undefined) {
    const result = themeSchema.safeParse(raw.theme)
    if (result.success) {
      await exampleThemeStorage.set(result.data)
    } else {
      warnings.push(`theme: ${prettifyError(result.error)}`)
    }
  }

  // Import command settings if present
  if (raw.commandSettings !== undefined) {
    const result = commandSettingsSchema.safeParse(raw.commandSettings)
    if (result.success) {
      await commandSettingsStorage.set(result.data)
    } else {
      warnings.push(`commandSettings: ${prettifyError(result.error)}`)
    }
  }

  return { warnings }
}

// ---- Helpers ------------------------------------------------------------

// Loose top-level schema: just ensures the JSON is a non-array object so that individual
// section schemas can validate each field independently and emit per-field warnings.
const importFileSchema = z.record(z.string(), z.unknown())

/**
 * Read the JSON file and do a minimal top-level sanity check.
 * Per-section validation (with Zod) is deferred to {@link importAllData}
 * so that one invalid section does not prevent other valid sections from being imported.
 */
function readImportFile(file: File): Promise<{ raw: Record<string, unknown>; warnings: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const parsed = JSON.parse(content)
        const result = importFileSchema.safeParse(parsed)

        if (!result.success) {
          throw new Error('expected a JSON object')
        }

        const raw = result.data
        if (!raw.settings && !raw.quickUrls && raw.theme === undefined && !raw.commandSettings) {
          throw new Error('no recognisable fields found')
        }

        resolve({ raw, warnings: [] })
      } catch (error) {
        reject(new Error('Failed to parse import file: ' + (error as Error).message))
      }
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsText(file)
  })
}
