import type { DevLocale, MessageKey } from './type'
import { getBundledMessage } from './bundled-message'

export function t(key: MessageKey, substitutions?: string | string[]) {
  // Chrome caches existing locale entries until the extension reloads; use live modules during development.
  if (import.meta.env.DEV) return getBundledMessage(key, chrome.i18n.getUILanguage(), substitutions)
  return (
    chrome.i18n.getMessage(key, substitutions) || getBundledMessage(key, chrome.i18n.getUILanguage(), substitutions)
  )
}

t.devLocale = '' as DevLocale // for type consistency with i18n-dev.ts
