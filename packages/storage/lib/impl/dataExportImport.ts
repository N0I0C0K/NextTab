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
  version: string
  exportDate: string
  theme?: Theme
  settings: SettingProps
  quickUrls: QuickUrlItem[]
  commandSettings?: CommandSettingsData
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
 * Import all user data from a JSON file
 */
export async function importAllData(file: File): Promise<void> {
  const data = await parseAndValidateImportFile(file)
  
  /**
   * We intentionally skip importing local wallpaper data because it is stored
   * in IndexedDB via `localWallpaperStorage` and is device-specific – it is
   * never included in exports.  If the imported settings request 'local'
   * wallpaperType but no IndexedDB-backed local wallpaper exists on this
   * device, we fall back to 'url' mode.
   */
  const currentSettings = await settingStorage.get()

  // Handle wallpaperType with validation and fallback for backward compatibility
  let wallpaperType = data.settings.wallpaperType ?? 'url'
  // Validate wallpaperType: must be 'url' or 'local'
  if (wallpaperType !== 'url' && wallpaperType !== 'local') {
    wallpaperType = 'url'
  }
  // If imported settings want local wallpaper but no local data exists on this device, switch to URL mode.
  // Local wallpaper data is intentionally device-specific and never included in exports.
  if (wallpaperType === 'local') {
    const localWallpaper = await localWallpaperStorage.get()
    if (!localWallpaper.imageData) {
      wallpaperType = 'url'
    }
  }

  await settingStorage.set({
    ...data.settings,
    wallpaperType,
    // Preserve user's preferred Wallhaven sort mode if not explicitly set in import
    wallhavenSortMode: data.settings.wallhavenSortMode ?? currentSettings.wallhavenSortMode ?? 'toplist',
  })
  
  // Import quick URLs
  await quickUrlItemsStorage.set(data.quickUrls)
  
  // Import theme if present
  if (data.theme) {
    await exampleThemeStorage.set(data.theme)
  }
  
  // Import command settings if present
  if (data.commandSettings) {
    await commandSettingsStorage.set(data.commandSettings)
  }
}

/**
 * Parse and validate the imported JSON file
 */
function parseAndValidateImportFile(file: File): Promise<ExportedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const data = JSON.parse(content) as ExportedData
        
        // Validate the imported data structure
        if (!data.settings || !data.quickUrls || !Array.isArray(data.quickUrls)) {
          throw new Error('Invalid data format: missing required fields (settings or quickUrls)')
        }
        
        // Validate settings structure
        if (typeof data.settings.useHistorySuggestion !== 'boolean' ||
            typeof data.settings.autoFocusCommandInput !== 'boolean' ||
            !data.settings.mqttSettings) {
          throw new Error('Invalid settings format')
        }
        
        // Validate quick URLs
        for (const item of data.quickUrls) {
          if (!item.id || !item.title || !item.url) {
            throw new Error('Invalid quick URL item: missing required fields')
          }
        }
        
        // Validate command settings if present
        if (data.commandSettings) {
          if (typeof data.commandSettings !== 'object' || Array.isArray(data.commandSettings) || data.commandSettings === null) {
            throw new Error('Invalid command settings format: must be an object')
          }
          for (const pluginSettings of Object.values(data.commandSettings)) {
            if (typeof pluginSettings.priority !== 'number' ||
                typeof pluginSettings.active !== 'boolean' ||
                typeof pluginSettings.activeKey !== 'string' ||
                typeof pluginSettings.includeInGlobal !== 'boolean') {
              throw new Error('Invalid command settings format')
            }
          }
        }
        
        resolve(data)
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
