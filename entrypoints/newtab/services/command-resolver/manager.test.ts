import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandSettingsData } from '@/utils/storage'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  watch: vi.fn(),
  resolve: vi.fn(),
  listener: undefined as ((value: CommandSettingsData) => void) | undefined,
}))

vi.mock('@/utils/storage', () => ({
  commandSettingsStorage: { getValue: mocks.read, watch: mocks.watch },
  defaultCommandSettings: {
    quickLinks: { active: true, priority: 3, activeKey: 'q', includeInGlobal: true },
  },
}))
vi.mock('@/utils', () => ({
  WarpDefaultObject: (value: object, defaults: object) => ({ ...defaults, ...value }),
}))
vi.mock('@/utils/i18n', () => ({ t: (key: string) => key }))
vi.mock('./plugin', () => {
  const plugin = (name: string) => ({
    properties: { name, displayName: name },
    settings: { active: name === 'quickLinks' },
    resolve: mocks.resolve,
  })
  return {
    historyResolver: plugin('history'),
    tabSearchResolver: plugin('tabs'),
    webSearchResolver: plugin('webSearch'),
    calculatorResolver: plugin('calculator'),
    numberToRmbResolver: plugin('numberToRmb'),
    bookmarksResolver: plugin('bookmarks'),
    quickLinksResolver: plugin('quickLinks'),
    pluginListResolver: plugin('__plugins'),
  }
})

const settings = (active: boolean): CommandSettingsData => ({
  quickLinks: { active, priority: 3, activeKey: 'q', includeInGlobal: true },
})
const query = { rawQuery: 'query', query: 'query', resolverName: 'quickLinks' }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('command settings recovery', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.read.mockReset()
    mocks.watch.mockReset().mockImplementation(listener => {
      mocks.listener = listener
      return () => undefined
    })
    mocks.listener = undefined
    mocks.resolve.mockReset().mockResolvedValue([])
  })

  it('shares a recovery read between overlapping queries after initialization fails', async () => {
    const recovery = deferred<CommandSettingsData>()
    mocks.read.mockRejectedValueOnce(new Error('unavailable')).mockReturnValue(recovery.promise)
    const { commandResolverService: service } = await import('./manager')
    const first = service.resolve(query, () => undefined)
    const second = service.resolve(query, () => undefined)
    await vi.waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2))
    recovery.resolve(settings(false))
    await Promise.all([first, second])
    expect(service.choosePlugins('query', 'quickLinks').plugins).toHaveLength(0)
    expect(mocks.resolve).not.toHaveBeenCalled()
    expect(mocks.watch).toHaveBeenCalledTimes(1)
  })

  it('does not overwrite a newer storage notification with a delayed initial snapshot', async () => {
    const initial = deferred<CommandSettingsData>()
    mocks.read.mockReturnValue(initial.promise)
    const { commandResolverService: service } = await import('./manager')
    const current = service.resolve(query, () => undefined)
    expect(mocks.listener).toBeDefined()
    mocks.listener!(settings(false))
    initial.resolve(settings(true))
    await current
    await service.resolve(query, () => undefined)
    expect(service.choosePlugins('query', 'quickLinks').plugins).toHaveLength(0)
    expect(mocks.resolve).not.toHaveBeenCalled()
    expect(mocks.read).toHaveBeenCalledTimes(1)
  })
})
