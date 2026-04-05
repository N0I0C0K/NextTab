/**
 * Permission origins for optional host permissions
 */
export const PERMISSION_ORIGINS = {
  GITHUB_API: 'https://api.github.com/*',
  WALLHAVEN_API: 'https://wallhaven.cc/*',
  MQTT_BROKER: 'wss://broker.emqx.io:8084/*',
} as const

export type PermissionOrigin = (typeof PERMISSION_ORIGINS)[keyof typeof PERMISSION_ORIGINS]

/**
 * Check if the extension has permission for the given origins
 */
export async function hasPermission(origins: string[]): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins })
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
    return await chrome.permissions.request({ origins })
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
    return await chrome.permissions.remove({ origins })
  } catch (error) {
    console.error('Failed to remove permission:', error)
    return false
  }
}
