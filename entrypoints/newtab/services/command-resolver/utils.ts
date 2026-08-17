/**
 * Strip the trigger key from the query for a specific plugin
 * Handles one space after the trigger key (e.g., "rmb 1233")
 * If multiple spaces exist, only remove the first one
 */
export function stripTriggerKeyForPlugin(rawQuery: string, activeKey: string): string {
  if (!activeKey || !rawQuery.startsWith(activeKey)) {
    return rawQuery
  }

  // Remove the activeKey
  let remaining = rawQuery.slice(activeKey.length)

  // If there's a space at the start, remove exactly one space
  if (remaining.startsWith(' ')) {
    remaining = remaining.slice(1)
  }

  return remaining
}
