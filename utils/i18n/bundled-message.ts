import { getMessageFromLocale } from './getMessageFromLocale'
import type { DevLocale, MessageKey } from './type'

type Message = {
  message: string
  placeholders?: Record<string, { content?: string }>
}

function localeFor(language: string): DevLocale {
  const normalized = language.toLowerCase().replace('_', '-')
  if (normalized.startsWith('de')) return 'de'
  if (normalized.startsWith('zh')) {
    return /(?:tw|hk|mo|hant)/.test(normalized) ? 'zh_TW' : 'zh_CN'
  }
  return 'en'
}

/** Use the bundled translations when Chrome's cached locale catalog has not picked up a new key yet. */
export function getBundledMessage(key: MessageKey, language: string, substitutions?: string | string[]): string {
  const entry = getMessageFromLocale(localeFor(language))[key] as Message
  const values = typeof substitutions === 'string' ? [substitutions] : (substitutions ?? [])

  const withPlaceholders = entry.message.replace(/\$([A-Za-z][A-Za-z0-9_]*)\$/g, (match, name: string) => {
    const content = entry.placeholders?.[name.toLowerCase()]?.content
    return content ? content.replace(/\$(\d+)/g, (_match, index: string) => values[Number(index) - 1] ?? '') : match
  })
  return withPlaceholders.replace(/\$(\d+)/g, (_match, index: string) => values[Number(index) - 1] ?? '')
}
