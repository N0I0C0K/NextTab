import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from './i18n-prod'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('runtime translations', () => {
  const mockChrome = (cachedMessage: string) =>
    vi.stubGlobal('chrome', {
      i18n: { getMessage: vi.fn(() => cachedMessage), getUILanguage: () => 'zh-CN' },
    })

  it('uses current bundled text in development even when Chrome has cached an older entry', () => {
    vi.stubEnv('DEV', true)
    mockChrome('旧的详细选取规则')
    expect(t('returnRecentRules')).toBe('根据最近 7 天的使用情况，推荐你可能想回访的页面。')
    expect(chrome.i18n.getMessage).not.toHaveBeenCalled()
  })

  it('uses Chrome translations in production', () => {
    vi.stubEnv('DEV', false)
    mockChrome('浏览器本地翻译')
    expect(t('returnRecentRules')).toBe('浏览器本地翻译')
  })

  it('keeps the bundled fallback and substitutions for missing production entries', () => {
    vi.stubEnv('DEV', false)
    mockChrome('')
    expect(t('deleteQuickItemConfirm', 'Github')).toBe('删除“Github”？')
  })
})
