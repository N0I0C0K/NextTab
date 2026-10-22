import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { buildSearchUrl, searchEnginesSchema, validateEngineInput, validateSearchTemplate } from './search-engines'
import {
  importAllDataFromText,
  exampleThemeStorage,
  searchEnginesStorage,
  saveSearchEngine,
  moveSearchEngine,
  removeSearchEngine,
  restoreSearchEngine,
} from './storage'

const github = { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=%s', enabled: true }
const bing = { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s', enabled: false }

describe('custom search engines', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    vi.restoreAllMocks()
  })
  it('encodes the raw query once at every placeholder, preserving the fixed template', () => {
    const query = '中文 & C++ / ? # %'
    const template = 'https://example.com/find/%s?query=%s&fixed=a%20b#%s'
    const encoded = encodeURIComponent(query)
    expect(buildSearchUrl(template, query)).toBe(
      `https://example.com/find/${encoded}?query=${encoded}&fixed=a%20b#${encoded}`,
    )
    expect(() => buildSearchUrl(template, '  ')).toThrow()
  })
  it.each([
    ['https://example.com/search', 'enginePlaceholderMissing'],
    ['javascript:alert("%s")', 'engineUrlInvalid'],
    ['https://%s.example.com/search', 'enginePlaceholderHost'],
    ['https:///%s.example.com/search', 'enginePlaceholderHost'],
    ['https:////%s.example.com/search', 'enginePlaceholderHost'],
    ['https://\\%s.example.com/search', 'enginePlaceholderHost'],
    ['https://user:pass@example.com/?q=%s', 'engineCredentials'],
    ['https://example.com:%s/', 'engineUrlInvalid'],
    ['not-a-url%s', 'engineUrlInvalid'],
    ['https:\\%s.example.com/search', 'engineUrlInvalid'],
    ['https:\t//%s.example.com/search', 'engineUrlInvalid'],
  ])('rejects an invalid or misplaced template %s', (template, error) => {
    expect(validateSearchTemplate(template)).toBe(error)
  })
  it('rejects duplicate names, IDs and oversized configuration units', () => {
    expect(validateEngineInput({ name: ' github ', url: github.url }, [github]).name).toBe('engineNameDuplicate')
    expect(validateEngineInput(github, [github], github.id).name).toBeUndefined()
    expect(searchEnginesSchema.safeParse([github, { ...bing, id: github.id }]).success).toBe(false)
    expect(searchEnginesSchema.safeParse([github, { ...bing, name: 'github' }]).success).toBe(false)
    expect(
      searchEnginesSchema.safeParse(
        Array.from({ length: 11 }, (_, index) => ({ ...github, id: String(index), name: String(index) })),
      ).success,
    ).toBe(false)
  })
  it('preserves order, enabled flags and identity through edits and undo', async () => {
    await saveSearchEngine(github)
    await saveSearchEngine(bing)
    await moveSearchEngine('bing', -1)
    await saveSearchEngine({ ...github, name: 'GitHub code' }, true)
    await removeSearchEngine('bing')
    await restoreSearchEngine(bing, 0)
    expect(await searchEnginesStorage.getValue()).toEqual([bing, { ...github, name: 'GitHub code' }])
    await expect(saveSearchEngine({ ...bing, id: 'deleted' }, true)).rejects.toThrow()
  })
  it('keeps the existing engines on a legacy or invalid import and accepts an explicit empty array', async () => {
    await searchEnginesStorage.setValue([github, bing])
    expect(
      (await importAllDataFromText(JSON.stringify({ settings: { autoFocusCommandInput: true } }))).warnings,
    ).toEqual([])
    expect(await searchEnginesStorage.getValue()).toEqual([github, bing])
    const result = await importAllDataFromText(
      JSON.stringify({ theme: 'dark', searchEngines: [github, { ...bing, url: 'https://bad.example/' }] }),
    )
    expect(result.warnings).toHaveLength(1)
    expect(await exampleThemeStorage.getValue()).toBe('dark')
    expect(await searchEnginesStorage.getValue()).toEqual([github, bing])
    expect((await importAllDataFromText(JSON.stringify({ searchEngines: [] }))).warnings).toEqual([])
    expect(await searchEnginesStorage.getValue()).toEqual([])
  })
  it('recovers the save queue after a failed write without pretending it succeeded', async () => {
    vi.spyOn(searchEnginesStorage, 'setValue').mockRejectedValueOnce(new Error('disk unavailable'))
    await expect(saveSearchEngine(github)).rejects.toThrow('disk unavailable')
    await saveSearchEngine(bing)
    expect(await searchEnginesStorage.getValue()).toEqual([bing])
  })
})
