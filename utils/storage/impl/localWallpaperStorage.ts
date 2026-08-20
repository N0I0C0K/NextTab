import { createIndexedDBStorage } from '../base/indexeddb'

export type LocalWallpaperData = { imageData: string | null }

export const localWallpaperStorage = createIndexedDBStorage<LocalWallpaperData>(
  'local-wallpaper',
  { imageData: null },
  { dbName: 'nexttab-local-wallpaper', storeName: 'wallpaper', version: 1 },
)

export const setLocalWallpaper = (imageData: string | null) => localWallpaperStorage.setValue({ imageData })
