# Import/Export Storage Guide

This document explains how the import/export system works and how to ensure all storage types are properly included.

## Overview

The import/export system in `lib/impl/dataExportImport.ts` provides functionality to export and import user settings. It includes a **type-level validation mechanism** to ensure all storage types are accounted for.

## Type-Level Validation

The validation works through three key components:

### 1. StorageTypeCheck Type

This type maps storage instance names to their corresponding data types:

```typescript
type StorageTypeCheck = {
  settingStorage: Omit<SettingProps, 'localWallpaperData'>
  quickUrlItemsStorage: QuickUrlItem[]
  exampleThemeStorage: Theme | undefined
  commandSettingsStorage: CommandSettingsData | undefined
  wallpaperHistoryStorage: WallpaperHistoryProps | undefined
  // Note: historySuggestStorage is intentionally excluded (generated from browser history)
  // Note: mqttStateStorage is intentionally excluded (runtime state, not user settings)
}
```

**When to include a storage:**
- ✅ User-configurable settings
- ✅ User-created data (quick URLs, wallpaper history, etc.)
- ❌ Runtime state (e.g., MQTT connection status)
- ❌ Dynamically generated data (e.g., history suggestions from browser)

### 2. ValidateExportedData Type

This compile-time check ensures that all storage types in `StorageTypeCheck` have corresponding fields in the `ExportedData` interface:

```typescript
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
```

### 3. Compile-Time Assertion

```typescript
// This will cause a compile error if the validation fails
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _typeCheck: ValidateExportedData = true
```

If a storage type is missing from `ExportedData` or has a type mismatch, TypeScript will fail to compile with a clear error message.

## Adding a New Storage Type to Import/Export

Follow these steps when adding a new storage type that should be included in import/export:

### Step 1: Add Import
```typescript
import type { YourStorageType } from './yourStorage'
import { yourStorage } from './yourStorage'
```

### Step 2: Update ExportedData Interface
```typescript
export interface ExportedData {
  version: string
  exportDate: string
  // ... existing fields
  yourData?: YourStorageType  // Use ? for optional backward compatibility
}
```

### Step 3: Update StorageTypeCheck
```typescript
type StorageTypeCheck = {
  // ... existing storage types
  yourStorage: YourStorageType | undefined
}
```

### Step 4: Update ValidateExportedData
```typescript
type ValidateExportedData = {
  [K in keyof StorageTypeCheck]: K extends 'settingStorage'
    ? ExportedData['settings']
    // ... existing mappings
    : K extends 'yourStorage'
    ? ExportedData['yourData']
    : never
} extends Record<keyof StorageTypeCheck, StorageTypeCheck[keyof StorageTypeCheck]>
  ? true
  : 'Error: ExportedData is missing storage types or has type mismatches'
```

### Step 5: Update exportAllData Function
```typescript
export async function exportAllData(): Promise<void> {
  // ... existing storage reads
  const yourData = await yourStorage.get()
  
  const exportData: ExportedData = {
    // ... existing fields
    yourData,
  }
  // ... rest of function
}
```

### Step 6: Update importAllData Function
```typescript
export async function importAllData(file: File): Promise<void> {
  const data = await parseAndValidateImportFile(file)
  
  // ... existing imports
  
  // Import your data if present
  if (data.yourData) {
    await yourStorage.set(data.yourData)
  }
}
```

### Step 7: (Optional) Add Validation
If your data has specific structure requirements, add validation in `parseAndValidateImportFile`:

```typescript
// Validate your data if present
if (data.yourData) {
  if (typeof data.yourData !== 'object') {
    throw new Error('Invalid your data format')
  }
  // Add more specific validation as needed
}
```

## Type Safety Benefits

1. **Compile-time errors**: If you forget to add a storage type to `ExportedData`, TypeScript will fail to compile
2. **Type matching**: If the types don't match between storage and export interface, you'll get a compile error
3. **Documentation**: The `StorageTypeCheck` type serves as living documentation of all exportable storage types
4. **Intentional exclusions**: Runtime state and generated data are explicitly documented as excluded

## Testing Your Changes

After adding a new storage type:

1. **Type check**: Run `pnpm type-check` to ensure no TypeScript errors
2. **Build**: Run `pnpm build` to verify everything compiles
3. **Manual test**: 
   - Export settings with your new data
   - Verify the exported JSON includes your data
   - Import the file in a fresh session
   - Verify your data is restored correctly

## Example: Adding Wallpaper History

This was the implementation for adding wallpaper history (completed):

```typescript
// Step 1: Imports
import type { WallpaperHistoryProps } from './wallpaperHistoryStorage'
import { wallpaperHistoryStorage } from './wallpaperHistoryStorage'

// Step 2: ExportedData interface
export interface ExportedData {
  // ...
  wallpaperHistory?: WallpaperHistoryProps
}

// Step 3: StorageTypeCheck
type StorageTypeCheck = {
  // ...
  wallpaperHistoryStorage: WallpaperHistoryProps | undefined
}

// Step 4: ValidateExportedData
type ValidateExportedData = {
  // ... 
  : K extends 'wallpaperHistoryStorage'
  ? ExportedData['wallpaperHistory']
  : never
  // ...
}

// Step 5: exportAllData
const wallpaperHistory = await wallpaperHistoryStorage.get()
const exportData: ExportedData = {
  // ...
  wallpaperHistory,
}

// Step 6: importAllData
if (data.wallpaperHistory) {
  await wallpaperHistoryStorage.set(data.wallpaperHistory)
}

// Step 7: Validation
if (data.wallpaperHistory) {
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
```

## Common Issues

### Issue: Type check passes but data isn't exported/imported

**Cause**: You updated the types but forgot to update the runtime functions.

**Solution**: Ensure you've updated both `exportAllData` and `importAllData` functions.

### Issue: Compile error "Type 'string' is not assignable to type 'never'"

**Cause**: Missing case in `ValidateExportedData` type.

**Solution**: Add the mapping for your new storage type in the conditional type.

### Issue: Data exports but fails to import

**Cause**: Missing or incorrect validation in `parseAndValidateImportFile`.

**Solution**: Add appropriate validation for your data structure.
