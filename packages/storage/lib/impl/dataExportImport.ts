/**
 * Data export/import functionality for user settings and data
 */

import type { QuickUrlItem } from '../base/types'
import type { SettingProps } from './settingsStorage'
import type { CommandSettingsData } from './commandSettingsStorage'
import { settingStorage } from './settingsStorage'
import { localWallpaperStorage } from './localWallpaperStorage'
import { quickUrlItemsStorage } from './quickUrlStorage'
import { exampleThemeStorage } from './exampleThemeStorage'
import { commandSettingsStorage } from './commandSettingsStorage'

// Import types from existing implementations
type Theme = 'light' | 'dark' | 'system'

export interface ExportedData {
  version?: string
  exportDate?: string
  theme?: Theme
  settings?: SettingProps
  quickUrls?: QuickUrlItem[]
  commandSettings?: CommandSettingsData
}

export type ImportResult = {
  warnings: string[]
}

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

/**
 * Import all user data from a JSON file.
 * Supports partial imports — missing fields are skipped and current values are preserved.
 * Returns warnings for any fields that could not be imported due to format incompatibilities.
 */
export async function importAllData(file: File): Promise<ImportResult> {
  const { data, warnings } = await parseAndValidateImportFile(file)

  // Import settings via deep-merge so missing fields fall back to current stored values
  if (data.settings && typeof data.settings === 'object') {
    const settingsToImport: Partial<SettingProps> = data.settings

    // Validate wallpaperType and ensure consistency with local wallpaper data
    if (settingsToImport.wallpaperType !== undefined) {
      if (settingsToImport.wallpaperType !== 'url' && settingsToImport.wallpaperType !== 'local') {
        settingsToImport.wallpaperType = 'url'
      }
      if (settingsToImport.wallpaperType === 'local') {
        settingsToImport.wallpaperType = 'url'
      }
    }

    // update() uses deepmerge, so only provided fields overwrite stored values.
    // localWallpaperData is never included in settingsToImport (type guarantees this),
    // so it is always preserved from the current device storage.
    await settingStorage.update(settingsToImport)
  }

  // Import quick URLs
  if (data.quickUrls !== undefined) {
    if (Array.isArray(data.quickUrls)) {
      const validUrls: QuickUrlItem[] = []
      let skippedCount = 0
      for (const item of data.quickUrls) {
        if (item && item.id && item.title && item.url) {
          validUrls.push(item)
        } else {
          skippedCount++
        }
      }
      if (skippedCount > 0) {
        warnings.push(`Skipped ${skippedCount} invalid quick URL item(s)`)
      }
      await quickUrlItemsStorage.set(validUrls)
    } else {
      warnings.push('quickUrls field has an unrecognised format and was skipped')
    }
  }

  // Import theme if present
  if (data.theme !== undefined) {
    if (data.theme === 'light' || data.theme === 'dark' || data.theme === 'system') {
      await exampleThemeStorage.set(data.theme)
    } else {
      warnings.push(`Unknown theme value "${data.theme}", skipped`)
    }
  }

  // Import command settings if present
  if (data.commandSettings !== undefined) {
    if (typeof data.commandSettings === 'object' && !Array.isArray(data.commandSettings) && data.commandSettings !== null) {
      await commandSettingsStorage.set(data.commandSettings)
    } else {
      warnings.push('commandSettings field has an unrecognised format and was skipped')
    }
  }

  return { warnings }
}

/**
 * Parse the imported JSON file and do a minimal sanity check.
 * All field-level validation is deferred to importAllData so partial data is accepted.
 */
function parseAndValidateImportFile(file: File): Promise<{ data: ExportedData; warnings: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const data = JSON.parse(content) as ExportedData

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error('Invalid data format: expected a JSON object')
        }

        // Require at least one known top-level field
        if (!data.settings && !data.quickUrls && data.theme === undefined && !data.commandSettings) {
          throw new Error('Invalid data format: no recognisable fields found')
        }

        resolve({ data, warnings: [] })
      } catch (error) {
        reject(new Error('Failed to parse JSON file: ' + (error as Error).message))
      }
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsText(file)
  })
}
