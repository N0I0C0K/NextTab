/**
 * Data export/import functionality for user settings and data
 */

import type { QuickUrlItem } from '../base/types'
import type { SettingProps } from './settingsStorage'
import type { CommandSettingsData } from './commandSettingsStorage'
import type { WallpaperHistoryProps } from './wallpaperHistoryStorage'
import { settingStorage } from './settingsStorage'
import { quickUrlItemsStorage } from './quickUrlStorage'
import { exampleThemeStorage } from './exampleThemeStorage'
import { commandSettingsStorage } from './commandSettingsStorage'
import { wallpaperHistoryStorage } from './wallpaperHistoryStorage'

// Import types from existing implementations
type Theme = 'light' | 'dark' | 'system'

/**
 * Interface for exported data structure.
 * 
 * IMPORTANT: When adding new storage types that should be exported:
 * 1. Add the storage import at the top of this file
 * 2. Add the field to this interface (optional fields should use `?`)
 * 3. Add to the exportAllData function to read the data
 * 4. Add to the importAllData function to write the data
 * 5. Add validation in parseAndValidateImportFile if needed
 * 6. Update the StorageTypeCheck type below to ensure type safety
 */
export interface ExportedData {
  version: string
  exportDate: string
  theme?: Theme
  settings: Omit<SettingProps, 'localWallpaperData'>
  quickUrls: QuickUrlItem[]
  commandSettings?: CommandSettingsData
  wallpaperHistory?: WallpaperHistoryProps
}

/**
 * Type-level validation to ensure all exportable storage types are included.
 * This creates a mapping of storage names to their expected types in ExportedData.
 * 
 * To add a new storage type:
 * 1. Add it to this type with the corresponding field from ExportedData
 * 2. TypeScript will ensure the types match
 */
type StorageTypeCheck = {
  settingStorage: Omit<SettingProps, 'localWallpaperData'>
  quickUrlItemsStorage: QuickUrlItem[]
  exampleThemeStorage: Theme | undefined
  commandSettingsStorage: CommandSettingsData | undefined
  wallpaperHistoryStorage: WallpaperHistoryProps | undefined
  // Note: historySuggestStorage is intentionally excluded (generated from browser history)
  // Note: mqttStateStorage is intentionally excluded (runtime state, not user settings)
}

/**
 * Compile-time check to ensure ExportedData includes all storage types.
 * This type should resolve without errors. If it fails, it means a storage type
 * is missing from ExportedData or has mismatched types.
 */
type ValidateExportedData = {
  [K in keyof StorageTypeCheck]: K extends 'settingStorage'
    ? ExportedData['settings']
    : K extends 'quickUrlItemsStorage'
    ? ExportedData['quickUrls']
    : K extends 'exampleThemeStorage'
    ? ExportedData['theme']
    : K extends 'commandSettingsStorage'
    ? ExportedData['commandSettings']
    : K extends 'wallpaperHistoryStorage'
    ? ExportedData['wallpaperHistory']
    : never
} extends Record<keyof StorageTypeCheck, StorageTypeCheck[keyof StorageTypeCheck]>
  ? true
  : 'Error: ExportedData is missing storage types or has type mismatches'

// This will cause a compile error if the validation fails
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _typeCheck: ValidateExportedData = true

/**
 * Export all user data as JSON and download it
 */
export async function exportAllData(): Promise<void> {
  const settings = await settingStorage.get()
  const quickUrls = await quickUrlItemsStorage.get()
  const theme = await exampleThemeStorage.get()
  const commandSettings = await commandSettingsStorage.get()
  const wallpaperHistory = await wallpaperHistoryStorage.get()
  
  // Exclude localWallpaperData from export to reduce file size
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { localWallpaperData, ...settingsToExport } = settings
  
  const exportData: ExportedData = {
    version: '1.0.0',
    exportDate: new Date().toISOString(),
    theme,
    settings: settingsToExport,
    quickUrls,
    commandSettings,
    wallpaperHistory,
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
   * We intentionally preserve localWallpaperData from the current settings rather than importing it.
   * This is because local wallpaper data is stored only on the current device and is not portable across exports/imports.
   * If the imported settings request 'local' wallpaperType but no local data exists, we switch to 'url' mode.
   */
  const currentSettings = await settingStorage.get()
  
  // Preserve local wallpaper data and ensure wallpaperType is consistent
  const hasLocalWallpaperData = !!currentSettings.localWallpaperData
  
  // Handle wallpaperType with validation and fallback for backward compatibility
  let wallpaperType = data.settings.wallpaperType ?? 'url'
  // Validate wallpaperType: must be 'url' or 'local'
  if (wallpaperType !== 'url' && wallpaperType !== 'local') {
    wallpaperType = 'url'
  }
  // If imported settings want local wallpaper but we don't have local data, switch to URL mode
  if (wallpaperType === 'local' && !hasLocalWallpaperData) {
    wallpaperType = 'url'
  }
  
  await settingStorage.set({
    ...data.settings,
    wallpaperType,
    localWallpaperData: currentSettings.localWallpaperData,
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
  
  // Import wallpaper history if present
  if (data.wallpaperHistory) {
    await wallpaperHistoryStorage.set(data.wallpaperHistory)
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
        
        // Validate wallpaper history if present
        if (data.wallpaperHistory) {
          if (typeof data.wallpaperHistory !== 'object' || Array.isArray(data.wallpaperHistory) || data.wallpaperHistory === null) {
            throw new Error('Invalid wallpaper history format: must be an object')
          }
          if (!Array.isArray(data.wallpaperHistory.history)) {
            throw new Error('Invalid wallpaper history format: history must be an array')
          }
          for (const historyItem of data.wallpaperHistory.history) {
            if (typeof historyItem.url !== 'string' ||
                typeof historyItem.thumbnailUrl !== 'string' ||
                typeof historyItem.addedAt !== 'number') {
              throw new Error('Invalid wallpaper history item format')
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
