/**
 * Compare two version strings to determine if an update is available
 * Assumes simple x.x.x version format (e.g., "1.0.1", "1.2.3")
 * @param current - Current version string
 * @param latest - Latest version string
 * @returns true if latest version is newer than current, false otherwise
 */
export const isUpdateAvailable = (current: string, latest: string): boolean => {
  // Normalize versions (remove leading 'v', trim)
  const cleanCurrent = current.replace(/^v/, '').trim()
  const cleanLatest = latest.replace(/^v/, '').trim()

  // Parse version numbers by splitting on dots and taking first 3 parts
  const parseParts = (version: string) => {
    const parts = version
      .split('.')
      .slice(0, 3)
      .map(p => parseInt(p, 10))
    // Pad with zeros if less than 3 parts
    while (parts.length < 3) {
      parts.push(0)
    }
    return parts
  }

  const currentParts = parseParts(cleanCurrent)
  const latestParts = parseParts(cleanLatest)

  // Compare major, minor, patch in order
  for (let i = 0; i < 3; i++) {
    if (latestParts[i] > currentParts[i]) {
      return true // Update available
    }
    if (latestParts[i] < currentParts[i]) {
      return false // Current is newer
    }
  }

  // Versions are equal
  return false
}
