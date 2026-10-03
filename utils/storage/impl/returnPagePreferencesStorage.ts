import { storage } from 'wxt/utils/storage'
import { updateStorageItem } from '../core'

export type ReturnPagePreferences = { hiddenUrls: string[]; excludedHosts: string[] }

// These browsing preferences stay local; they are not part of MQTT or data exports.
export const returnPagePreferencesStorage = storage.defineItem<ReturnPagePreferences>('local:return-page-preferences', {
  fallback: { hiddenUrls: [], excludedHosts: [] },
})

export async function setReturnPagePreference(field: keyof ReturnPagePreferences, value: string, excluded: boolean) {
  await updateStorageItem(returnPagePreferencesStorage, current => ({
    ...current,
    [field]: excluded ? [...new Set([...current[field], value])] : current[field].filter(item => item !== value),
  }))
}
