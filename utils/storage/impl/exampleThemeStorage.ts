import { storage } from 'wxt/utils/storage'

export type Theme = 'light' | 'dark' | 'system'

export const exampleThemeStorage = storage.defineItem<Theme>('local:theme-storage-key', {
  fallback: 'system',
})

export async function toggleTheme(): Promise<void> {
  const currentTheme = await exampleThemeStorage.getValue()
  if (currentTheme !== 'system') {
    await exampleThemeStorage.setValue(currentTheme === 'light' ? 'dark' : 'light')
  }
}
