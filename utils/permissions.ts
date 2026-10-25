/**
 * Permission origins for optional host permissions
 */
export const PERMISSION_ORIGINS = {
  GITHUB_API: 'https://api.github.com/*',
  WALLHAVEN_API: 'https://wallhaven.cc/*',
  MQTT_BROKER: 'wss://broker.emqx.io:8084/*',
} as const

export type PermissionOrigin = (typeof PERMISSION_ORIGINS)[keyof typeof PERMISSION_ORIGINS]

export const FIREFOX_MQTT_DATA_PERMISSIONS = [
  'authenticationInfo',
  'personallyIdentifyingInfo',
  'technicalAndInteraction',
]

type DataCollectionPermissions = chrome.permissions.Permissions & { data_collection?: string[] }

function permissionDetails(origins: string[]): DataCollectionPermissions {
  return {
    origins,
    ...(import.meta.env.BROWSER === 'firefox' && origins.includes(PERMISSION_ORIGINS.MQTT_BROKER)
      ? { data_collection: FIREFOX_MQTT_DATA_PERMISSIONS }
      : {}),
  }
}

/** Data consent can be revoked separately from the broker's host permission. */
export function isRelevantPermissionChange(permissions: DataCollectionPermissions, origins: string[]): boolean {
  const requested = permissionDetails(origins)
  return (
    permissions.origins?.some(origin => origins.includes(origin)) === true ||
    permissions.data_collection?.some(type => requested.data_collection?.includes(type)) === true
  )
}

/**
 * Check if the extension has permission for the given origins
 */
export async function hasPermission(origins: string[]): Promise<boolean> {
  try {
    return await chrome.permissions.contains(permissionDetails(origins))
  } catch (error) {
    console.error('Failed to check permission:', error)
    return false
  }
}

/**
 * Request permission for the given origins
 * Must be called in a user gesture context (e.g., click handler)
 */
export async function requestPermission(origins: string[]): Promise<boolean> {
  try {
    return await chrome.permissions.request(permissionDetails(origins))
  } catch (error) {
    console.error('Failed to request permission:', error)
    return false
  }
}

/**
 * Remove permission for the given origins
 */
export async function removePermission(origins: string[]): Promise<boolean> {
  try {
    return await chrome.permissions.remove(permissionDetails(origins))
  } catch (error) {
    console.error('Failed to remove permission:', error)
    return false
  }
}
