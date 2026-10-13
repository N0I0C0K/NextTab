import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FIREFOX_MQTT_DATA_PERMISSIONS,
  PERMISSION_ORIGINS,
  hasPermission,
  isRelevantPermissionChange,
  requestPermission,
} from './permissions'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('optional MQTT data consent', () => {
  it('keeps Chrome requests compatible with host permissions alone', async () => {
    vi.stubEnv('BROWSER', 'chrome')
    const contains = vi.fn().mockResolvedValue(true)
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { contains, request } })
    const origins = [PERMISSION_ORIGINS.MQTT_BROKER]
    expect(await hasPermission(origins)).toBe(true)
    expect(await requestPermission(origins)).toBe(true)
    expect(contains).toHaveBeenCalledWith({ origins })
    expect(request).toHaveBeenCalledWith({ origins })
  })

  it('blocks Firefox connections when the host is granted but one data category is missing', async () => {
    vi.stubEnv('BROWSER', 'firefox')
    const granted = new Set(FIREFOX_MQTT_DATA_PERMISSIONS.slice(1))
    const contains = vi.fn(async ({ data_collection }: { data_collection: string[] }) =>
      data_collection.every(type => granted.has(type)),
    )
    vi.stubGlobal('chrome', { permissions: { contains } })
    expect(await hasPermission([PERMISSION_ORIGINS.MQTT_BROKER])).toBe(false)
    granted.add(FIREFOX_MQTT_DATA_PERMISSIONS[0])
    expect(await hasPermission([PERMISSION_ORIGINS.MQTT_BROKER])).toBe(true)
  })

  it('requests all MQTT data consent in the user gesture and respects rejection', async () => {
    vi.stubEnv('BROWSER', 'firefox')
    const request = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('chrome', { permissions: { request } })
    expect(await requestPermission([PERMISSION_ORIGINS.MQTT_BROKER])).toBe(false)
    expect(request).toHaveBeenCalledWith({
      origins: [PERMISSION_ORIGINS.MQTT_BROKER],
      data_collection: FIREFOX_MQTT_DATA_PERMISSIONS,
    })
    await requestPermission([PERMISSION_ORIGINS.GITHUB_API])
    expect(request).toHaveBeenLastCalledWith({ origins: [PERMISSION_ORIGINS.GITHUB_API] })
  })

  it('detects data-only revocation for MQTT without changing unrelated permission state', () => {
    vi.stubEnv('BROWSER', 'firefox')
    const event = { data_collection: ['personallyIdentifyingInfo'] }
    expect(isRelevantPermissionChange(event, [PERMISSION_ORIGINS.MQTT_BROKER])).toBe(true)
    expect(isRelevantPermissionChange(event, [PERMISSION_ORIGINS.GITHUB_API])).toBe(false)
    expect(
      isRelevantPermissionChange({ data_collection: ['browsingActivity'] }, [PERMISSION_ORIGINS.MQTT_BROKER]),
    ).toBe(false)
  })
})
