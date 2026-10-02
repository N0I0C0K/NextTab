import type { DevLocale, MessageKey } from './type'
import { getBundledMessage } from './bundled-message'

export function t(key: MessageKey, substitutions?: string | string[]) {
  return (
    chrome.i18n.getMessage(key, substitutions) || getBundledMessage(key, chrome.i18n.getUILanguage(), substitutions)
  )
}

t.devLocale = '' as DevLocale // for type consistency with i18n-dev.ts
